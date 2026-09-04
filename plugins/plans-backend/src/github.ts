import { LoggerService } from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import {
  AUTH_LOGIN_TOOL,
  AuthLoginResult,
  McpContentItem,
  MusterMcpClient,
  parseAuthLoginResult,
  readMusterInstallationsFromConfig,
} from '@giantswarm/backstage-plugin-gs-node';

/**
 * GitHub, reached as the signed-in person through muster.
 *
 * The portal never holds a GitHub credential: the caller's Dex ID token goes to
 * muster, muster holds the person's GitHub grant (its GitHub connector,
 * `grantScope: subject`) and runs the GitHub MCP server's tools with it. This
 * gateway is the thin seam the router talks to, so tests can replace it.
 */
export interface GithubGateway {
  /** Run a GitHub MCP tool as the caller; returns the tool's parsed payload. */
  call(
    tool: string,
    args: Record<string, unknown>,
    authToken: string,
  ): Promise<unknown>;
  /** Like call, but returns every content block (files come as resources). */
  callContent(
    tool: string,
    args: Record<string, unknown>,
    authToken: string,
  ): Promise<McpContentItem[]>;
  /**
   * Ask muster to connect the caller to the GitHub server: `connected` when
   * a grant exists (the person consented before, in any session),
   * `auth_required` with the sign-in URL otherwise.
   */
  login(authToken: string): Promise<AuthLoginResult>;
}

/** Where the GitHub MCP server lives, from `plans.muster`. */
export interface GithubViaMusterConfig {
  /** Name of the muster installation in `muster.installations`. */
  installation: string;
  /** Name of the GitHub MCPServer in that muster (the `core_auth_login` target). */
  server: string;
  /** Tool prefix muster exposes the server's tools under; default: the server name. */
  toolPrefix: string;
}

export function readGithubViaMusterConfig(
  config: Config,
): GithubViaMusterConfig | undefined {
  const muster = config.getOptionalConfig('plans.muster');
  if (!muster) {
    return undefined;
  }
  const server = muster.getString('server');
  return {
    installation: muster.getString('installation'),
    server,
    toolPrefix: muster.getOptionalString('toolPrefix') ?? server,
  };
}

/**
 * The muster-backed gateway. One MCP session per caller token (the client
 * caches connections per token), tools addressed as `x_<prefix>_<tool>`.
 */
export class MusterGithubGateway implements GithubGateway {
  constructor(
    private readonly client: MusterMcpClient,
    private readonly server: string,
    private readonly toolPrefix: string,
  ) {}

  static fromConfig(
    config: Config,
    logger: LoggerService,
  ): MusterGithubGateway | undefined {
    const settings = readGithubViaMusterConfig(config);
    if (!settings) {
      return undefined;
    }
    const installations = readMusterInstallationsFromConfig(config, logger);
    const installation = installations.get(settings.installation);
    if (!installation) {
      throw new Error(
        `plans.muster.installation '${settings.installation}' is not listed in muster.installations`,
      );
    }
    return new MusterGithubGateway(
      new MusterMcpClient(installation, logger),
      settings.server,
      settings.toolPrefix,
    );
  }

  private toolName(tool: string): string {
    return `x_${this.toolPrefix}_${tool}`;
  }

  call(
    tool: string,
    args: Record<string, unknown>,
    authToken: string,
  ): Promise<unknown> {
    return this.client.callTool(this.toolName(tool), args, { authToken });
  }

  callContent(
    tool: string,
    args: Record<string, unknown>,
    authToken: string,
  ): Promise<McpContentItem[]> {
    return this.client.callToolContent(this.toolName(tool), args, {
      authToken,
    });
  }

  async login(authToken: string): Promise<AuthLoginResult> {
    const result = await this.client.callToolWithStructured(
      AUTH_LOGIN_TOOL,
      { server: this.server },
      { authToken },
    );
    return parseAuthLoginResult(result);
  }
}

/**
 * The caller has no GitHub grant in muster yet: they have to complete the
 * sign-in at `authUrl` once (GitHub redirects straight back when the App is
 * already authorized, i.e. after the Dex GitHub login).
 */
export class GithubNotConnectedError extends Error {
  readonly name = 'GithubNotConnectedError';
  constructor(
    message: string,
    readonly authUrl?: string,
  ) {
    super(message);
  }
}

/**
 * Muster's answers when the caller's session is not connected to the server:
 * the tool is not in the session's tool set (no session has connected the
 * server yet), the connection needs auth, or -- once any session connected
 * the server, so muster knows its tools -- the call fails with
 * `user not authenticated to server <name>`. The last one is what a person's
 * second session, or the next person, hits; `core_auth_login` connects it
 * from the subject grant or hands out the sign-in URL.
 */
const NOT_CONNECTED_PATTERNS = [
  /tool not found/i,
  /unknown tool/i,
  /not connected/i,
  /not authenticated to server/i,
  /auth(entication|orization)? required/i,
  /requires authentication/i,
];

export function looksNotConnected(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return NOT_CONNECTED_PATTERNS.some(pattern => pattern.test(message));
}

/**
 * Runs a GitHub call as the caller. When muster reports the session is not
 * connected to the GitHub server, connects it (a person who consented before
 * reconnects silently) and retries once; when that needs a sign-in, throws
 * {@link GithubNotConnectedError} carrying the URL to complete.
 */
export async function asConnected<T>(
  gateway: GithubGateway,
  authToken: string,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!looksNotConnected(error)) {
      throw error;
    }
    const login = await gateway.login(authToken);
    if (login.status === 'connected') {
      return run();
    }
    throw new GithubNotConnectedError(
      login.status === 'auth_required'
        ? 'Connect your GitHub account to muster to use the plans page.'
        : `GitHub is not connected: ${login.message}`,
      login.authUrl,
    );
  }
}
