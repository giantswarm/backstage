import { LoggerService } from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import { NotFoundError, ServiceUnavailableError } from '@backstage/errors';
import {
  experimental_createMCPClient as createMCPClient,
  MCPClient,
} from '@ai-sdk/mcp';
import {
  isClosedClientError,
  McpClientCache,
} from '@giantswarm/backstage-plugin-gs-node';

/**
 * The muster aggregator only exposes its meta-tools over MCP. Discovery
 * meta-tools (list_tools, filter_tools, ...) are invoked directly; concrete
 * aggregated tools (core_workflow_list, core_mcpserver_list, x_<server>_*,
 * workflow_<name>, ...) are invoked indirectly through the `call_tool`
 * meta-tool with the target tool name + arguments.
 */
const META_TOOLS = [
  'list_tools',
  'describe_tool',
  'list_core_tools',
  'filter_tools',
  'call_tool',
] as const;

export type MetaToolName = (typeof META_TOOLS)[number];

/** Muster meta-tool used to execute any aggregated tool by name. */
const CALL_TOOL = 'call_tool';

export interface MusterServerConfig {
  url: string;
  headers?: Record<string, string>;
  /**
   * When set, requests to the muster server must carry a per-user OAuth
   * token for this auth provider (forwarded by the frontend).
   */
  authProvider?: string;
}

/**
 * One muster aggregator endpoint. A single muster federates many management
 * clusters, so the plugin can be pointed at several musters (one per
 * installation) and routes select the active one via `?installation=`.
 */
export interface MusterInstallationConfig extends MusterServerConfig {
  /** Stable installation id used for routing and as the client cache scope. */
  name: string;
}

/**
 * Read a single muster MCP server connection from the existing `aiChat.mcp`
 * config array (legacy single-installation path). The entry is selected by
 * name (`muster.serverName`, default `muster`) and supports the same
 * plain/static-header rules as ai-chat-backend's readMcpServersFromConfig.
 * Entries with `authProvider` require the frontend to forward a per-user
 * token; entries with `useBackstageUserToken` are unsupported and reported as
 * unconfigured.
 */
export function readMusterServerFromConfig(
  config: Config,
  logger: LoggerService,
): MusterServerConfig | undefined {
  const serverName = config.getOptionalString('muster.serverName') ?? 'muster';

  const mcpConfigs = config.getOptionalConfigArray('aiChat.mcp');
  const mcpConfig = mcpConfigs?.find(
    mcp => mcp.getOptionalString('name') === serverName,
  );
  if (!mcpConfig) {
    return undefined;
  }

  if (mcpConfig.getOptionalBoolean('useBackstageUserToken')) {
    logger.warn(
      `MCP server '${serverName}' is configured with useBackstageUserToken, which the muster backend plugin does not support. Muster endpoints will be disabled.`,
    );
    return undefined;
  }

  const url = mcpConfig.getString('url');
  const authProvider = mcpConfig.getOptionalString('authProvider');

  const headersConfig = mcpConfig.getOptionalConfig('headers');
  let headers: Record<string, string> | undefined;
  if (headersConfig) {
    headers = {};
    for (const key of headersConfig.keys()) {
      headers[key] = headersConfig.getString(key);
    }
  }

  return { url, headers, authProvider };
}

function readHeaders(
  headersConfig: Config | undefined,
): Record<string, string> | undefined {
  if (!headersConfig) {
    return undefined;
  }
  const headers: Record<string, string> = {};
  for (const key of headersConfig.keys()) {
    headers[key] = headersConfig.getString(key);
  }
  return headers;
}

/**
 * Resolve the set of muster installations the proxy can target, keyed by
 * installation name.
 *
 * Two sources, in order of precedence:
 *   1. `muster.installations` — an explicit list of `{ name, url,
 *      authProvider?, headers? }` entries (multi-installation).
 *   2. The legacy single `aiChat.mcp` entry selected by `muster.serverName`
 *      (default `muster`), registered under that name.
 *
 * Returns an empty map when nothing is configured.
 */
export function readMusterInstallationsFromConfig(
  config: Config,
  logger: LoggerService,
): Map<string, MusterInstallationConfig> {
  const installations = new Map<string, MusterInstallationConfig>();

  const explicit = config.getOptionalConfigArray('muster.installations');
  if (explicit && explicit.length > 0) {
    for (const entry of explicit) {
      const name = entry.getString('name');
      const url = entry.getString('url');
      if (installations.has(name)) {
        logger.warn(
          `Duplicate muster installation '${name}' in muster.installations; keeping the first.`,
        );
        continue;
      }
      installations.set(name, {
        name,
        url,
        authProvider: entry.getOptionalString('authProvider'),
        headers: readHeaders(entry.getOptionalConfig('headers')),
      });
    }
    return installations;
  }

  const legacy = readMusterServerFromConfig(config, logger);
  if (legacy) {
    const name = config.getOptionalString('muster.serverName') ?? 'muster';
    installations.set(name, { name, ...legacy });
  }
  return installations;
}

interface ContentItem {
  type: string;
  text?: string;
}

/**
 * Thin client around a single muster MCP aggregator. It exposes muster's
 * meta-tools as typed JSON calls: discovery meta-tools are invoked directly,
 * concrete aggregated tools go through `call_tool`. Connections are cached per
 * user token via the shared McpClientCache (TTL-based + close-detected
 * recreation), scoped to this installation, so a server behind per-user auth
 * gets one MCP session per user instead of one global session.
 */
export class MusterMcpClient {
  private readonly cache: McpClientCache;

  constructor(
    private readonly installation: MusterInstallationConfig,
    private readonly logger: LoggerService,
    private readonly clientFactory: (
      headers: Record<string, string> | undefined,
    ) => Promise<MCPClient> = headers =>
      createMCPClient({
        name: 'muster-backend',
        transport: {
          type: 'http',
          url: installation.url,
          headers,
        },
      }),
  ) {
    this.cache = new McpClientCache(logger);
  }

  /**
   * Invoke a muster meta-tool directly (list_tools, filter_tools,
   * describe_tool, list_core_tools, call_tool) and return its parsed payload.
   */
  async invokeMetaTool(
    metaTool: MetaToolName,
    args: Record<string, unknown>,
    options?: { authToken?: string },
  ): Promise<unknown> {
    if (!META_TOOLS.includes(metaTool)) {
      throw new NotFoundError(`Unknown muster meta-tool: ${metaTool}`);
    }

    const authToken = options?.authToken;
    const cacheKey = McpClientCache.buildKey(this.installation.name, authToken);

    const headers: Record<string, string> | undefined =
      authToken !== undefined
        ? { ...this.installation.headers, Authorization: `Bearer ${authToken}` }
        : this.installation.headers;

    const client = await this.cache.getOrCreate(cacheKey, () =>
      this.clientFactory(headers),
    );
    const tools = client.toolsFromDefinitions({
      tools: [{ name: metaTool, inputSchema: { type: 'object' as const } }],
    });

    const tool = tools[metaTool];
    if (!tool || typeof tool.execute !== 'function') {
      throw new ServiceUnavailableError(
        `Muster meta-tool ${metaTool} has no executor`,
      );
    }

    let result;
    try {
      result = await tool.execute(args, {
        toolCallId: `muster-backend-${metaTool}`,
        messages: [],
        // ai@7 added a required `context` field to ToolExecutionOptions
        // (formerly experimental_context). Muster meta-tools carry no tool
        // context, so pass undefined.
        context: undefined,
      });
    } catch (error) {
      if (isClosedClientError(error)) {
        this.logger.warn(
          `Muster MCP client returned a closed-client error; reconnecting on the next request.`,
        );
        this.cache.markDead(cacheKey);
      }
      throw error;
    }

    return this.parseResult(result, metaTool);
  }

  /**
   * Execute a concrete aggregated tool by name through the `call_tool`
   * meta-tool. This is the path for core_* tools, workflow_<name> runs, and
   * x_<server>_* aggregated tools. The caller (router) is responsible for the
   * read-only/mutation safety gate.
   */
  async callTool(
    toolName: string,
    args: Record<string, unknown>,
    options?: { authToken?: string },
  ): Promise<unknown> {
    return this.invokeMetaTool(
      CALL_TOOL,
      { name: toolName, arguments: args },
      options,
    );
  }

  async listTools(options?: { authToken?: string }): Promise<unknown> {
    return this.invokeMetaTool('list_tools', {}, options);
  }

  async filterTools(
    args: Record<string, unknown>,
    options?: { authToken?: string },
  ): Promise<unknown> {
    return this.invokeMetaTool('filter_tools', args, options);
  }

  async describeTool(
    name: string,
    options?: { authToken?: string },
  ): Promise<unknown> {
    return this.invokeMetaTool('describe_tool', { name }, options);
  }

  async listCoreTools(
    args: Record<string, unknown>,
    options?: { authToken?: string },
  ): Promise<unknown> {
    return this.invokeMetaTool('list_core_tools', args, options);
  }

  async dispose(): Promise<void> {
    await this.cache.dispose();
  }

  /**
   * Unwrap an MCP tool result's first text content block. Tool-level errors
   * (isError) surface as exceptions with the error text.
   */
  private unwrapTextContent(
    result: unknown,
    toolName: string,
  ): string | undefined {
    const { content, isError } = (result ?? {}) as {
      content?: ContentItem[];
      isError?: boolean;
    };

    const text = content?.find(item => item.type === 'text')?.text;

    if (isError) {
      throw new Error(
        text ?? `Muster tool ${toolName} failed without an error message`,
      );
    }

    return text;
  }

  /**
   * Discovery meta-tools return their payload as a single JSON text block
   * (one unwrap), while `call_tool` wraps the target tool's MCP result as a
   * JSON string inside its own text block (two unwraps). This unwraps the
   * outer envelope, and when the inner value is itself a `{ content: [...] }`
   * MCP result it unwraps once more — covering both shapes with one path.
   */
  private parseResult(result: unknown, toolName: string): unknown {
    const envelope = this.unwrapTextContent(result, toolName);
    if (envelope === undefined) {
      return undefined;
    }

    let inner: unknown;
    try {
      inner = JSON.parse(envelope);
    } catch {
      // Not a JSON envelope; treat it as the tool's direct payload.
      return envelope;
    }

    if (
      inner === null ||
      typeof inner !== 'object' ||
      !Array.isArray((inner as { content?: unknown }).content)
    ) {
      // Direct JSON payload (discovery meta-tools, or a server that exposes
      // tools without the call_tool envelope).
      return inner;
    }

    const text = this.unwrapTextContent(inner, toolName);
    if (text === undefined) {
      return undefined;
    }

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
}
