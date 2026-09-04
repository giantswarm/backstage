import { LoggerService } from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import {
  AUTH_LOGIN_TOOL,
  AuthLoginResult,
  parseAuthLoginResult,
} from './authLogin';
import {
  McpContentItem,
  MusterMcpClient,
  readMusterInstallationsFromConfig,
} from './MusterMcpClient';

/**
 * Where a backend plugin finds the MCP server it works with: a server
 * registered in one of the portal's muster installations. Read from
 * `<plugin>.muster` by {@link readMusterServerRef}.
 */
export interface MusterServerRef {
  /** Name of the muster installation in `muster.installations`. */
  installation: string;
  /** Name of the MCPServer in that muster (the `core_auth_login` target). */
  server: string;
  /** Tool prefix muster exposes the server's tools under; default: the server name. */
  toolPrefix: string;
}

/**
 * Reads `<key>.muster: { installation, server, toolPrefix? }`, or undefined
 * when the plugin is not wired to muster.
 */
export function readMusterServerRef(
  config: Config,
  key: string,
): MusterServerRef | undefined {
  const muster = config.getOptionalConfig(`${key}.muster`);
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
 * One MCP server behind muster, called as the signed-in person: every call
 * carries the caller's muster token, muster runs the tool with the person's
 * own grant for that server. The thin seam backend routers talk to, so tests
 * can replace it.
 */
export interface MusterServerGateway {
  /** Run a tool of the server as the caller; returns the tool's parsed payload. */
  call(
    tool: string,
    args: Record<string, unknown>,
    authToken: string,
  ): Promise<unknown>;
  /** Like call, but returns every content block (embedded resources included). */
  callContent(
    tool: string,
    args: Record<string, unknown>,
    authToken: string,
  ): Promise<McpContentItem[]>;
  /**
   * Ask muster to connect the caller to the server: `connected` when a grant
   * exists (the person consented before, in any session), `auth_required`
   * with the sign-in URL otherwise.
   */
  login(authToken: string): Promise<AuthLoginResult>;
}

/** The muster-backed gateway: tools addressed as `x_<prefix>_<tool>`. */
export class MusterServerClient implements MusterServerGateway {
  constructor(
    private readonly client: MusterMcpClient,
    readonly server: string,
    private readonly toolPrefix: string,
  ) {}

  /**
   * Builds the gateway for `<key>.muster`; undefined when the plugin is not
   * wired to muster, an error when it names an unknown installation.
   */
  static fromConfig(
    config: Config,
    logger: LoggerService,
    key: string,
  ): MusterServerClient | undefined {
    const ref = readMusterServerRef(config, key);
    if (!ref) {
      return undefined;
    }
    const installation = readMusterInstallationsFromConfig(config, logger).get(
      ref.installation,
    );
    if (!installation) {
      throw new Error(
        `${key}.muster.installation '${ref.installation}' is not listed in muster.installations`,
      );
    }
    return new MusterServerClient(
      new MusterMcpClient(installation, logger),
      ref.server,
      ref.toolPrefix,
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
 * The caller's muster session holds no grant for the server yet: they have
 * to complete the sign-in at `authUrl` once. Backends answer it as 401 with
 * the URL so a frontend can offer the connect step.
 */
export class MusterServerNotConnectedError extends Error {
  readonly name = 'MusterServerNotConnectedError';
  constructor(
    message: string,
    readonly server: string,
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
 * Runs a call as the caller. When muster reports the session is not connected
 * to the server, connects it (a person who consented before reconnects
 * silently) and retries once; when that needs a sign-in, throws
 * {@link MusterServerNotConnectedError} carrying the URL to complete.
 */
export async function asConnected<T>(
  gateway: MusterServerGateway,
  server: string,
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
    throw new MusterServerNotConnectedError(
      login.status === 'auth_required'
        ? `Connect '${server}' in muster to use this page.`
        : `'${server}' is not connected: ${login.message}`,
      server,
      login.authUrl,
    );
  }
}
