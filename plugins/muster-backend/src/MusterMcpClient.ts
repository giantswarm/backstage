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
  'filter_resources',
  'filter_prompts',
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
  /**
   * Name of the MCP server (as registered in muster) that fronts this
   * installation's own Prometheus/Mimir, used by the `/usage` route. When
   * unset, the route falls back to the `<name>-mcp-prometheus` convention,
   * then to the only prometheus-ish server.
   */
  prometheusServer?: string;
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
        prometheusServer: entry.getOptionalString('prometheusServer'),
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
 * The human-readable message of an errored tool result's text block. When the
 * text is itself a serialized MCP result (`{"isError":true,"content":[...]}` —
 * what `call_tool` puts in its envelope for a failed wrapped tool), return the
 * inner text block's text; otherwise the text already is the message.
 */
function errorTextOf(text: string): string {
  let inner: unknown;
  try {
    inner = JSON.parse(text);
  } catch {
    return text;
  }
  if (inner === null || typeof inner !== 'object') {
    return text;
  }
  const content = (inner as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return text;
  }
  const innerText = (content as ContentItem[]).find(
    item => item?.type === 'text',
  )?.text;
  return innerText ?? text;
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
    const result = await this.executeMetaTool(metaTool, args, options);
    return this.parseResult(result, metaTool);
  }

  /** Run a meta-tool and return its raw MCP result (no envelope parsing). */
  private async executeMetaTool(
    metaTool: MetaToolName,
    args: Record<string, unknown>,
    options?: { authToken?: string },
  ): Promise<unknown> {
    if (!META_TOOLS.includes(metaTool)) {
      throw new NotFoundError(`Unknown muster meta-tool: ${metaTool}`);
    }

    const { client, cacheKey } = await this.connect(options);
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
      this.handleRequestError(error, cacheKey);
      throw error;
    }

    return result;
  }

  /**
   * Resolve the cached MCP client for this installation and caller. The cache is
   * keyed per user token, so a server behind per-user auth gets one MCP session
   * per user -- which is also what makes muster's per-session downstream auth
   * state (see getResource / auth://status) stable across requests.
   */
  private async connect(options?: { authToken?: string }): Promise<{
    client: MCPClient;
    cacheKey: string;
  }> {
    const authToken = options?.authToken;
    const cacheKey = McpClientCache.buildKey(this.installation.name, authToken);

    const headers: Record<string, string> | undefined =
      authToken !== undefined
        ? { ...this.installation.headers, Authorization: `Bearer ${authToken}` }
        : this.installation.headers;

    const client = await this.cache.getOrCreate(cacheKey, () =>
      this.clientFactory(headers),
    );
    return { client, cacheKey };
  }

  private handleRequestError(error: unknown, cacheKey: string): void {
    if (isClosedClientError(error)) {
      this.logger.warn(
        `Muster MCP client returned a closed-client error; reconnecting on the next request.`,
      );
      this.cache.markDead(cacheKey);
    }
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

  /**
   * Like {@link callTool}, but preserves the wrapped tool's MCP
   * `structuredContent` alongside its text payload. `call_tool` serialises the
   * target tool's full result (`{isError, content, structuredContent}`) as a
   * JSON envelope, which {@link callTool}'s parsing reduces to the text alone —
   * fine for tools whose payload IS that JSON text, lossy for tools like
   * `core_auth_login` that put the machine-readable part (the sign-in URL) in
   * `structuredContent` (muster#1025). Tool-level errors throw, same as
   * callTool.
   */
  async callToolWithStructured(
    toolName: string,
    args: Record<string, unknown>,
    options?: { authToken?: string },
  ): Promise<{ text?: string; structuredContent?: unknown }> {
    const result = await this.executeMetaTool(
      CALL_TOOL,
      { name: toolName, arguments: args },
      options,
    );

    const envelope = this.unwrapTextContent(result, toolName);
    if (envelope === undefined) {
      return {};
    }

    let inner: unknown;
    try {
      inner = JSON.parse(envelope);
    } catch {
      return { text: envelope };
    }
    if (
      inner === null ||
      typeof inner !== 'object' ||
      !Array.isArray((inner as { content?: unknown }).content)
    ) {
      return { text: envelope };
    }

    return {
      text: this.unwrapTextContent(inner, toolName),
      structuredContent: (inner as { structuredContent?: unknown })
        .structuredContent,
    };
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

  async filterResources(
    args: Record<string, unknown>,
    options?: { authToken?: string },
  ): Promise<unknown> {
    return this.invokeMetaTool('filter_resources', args, options);
  }

  async filterPrompts(
    args: Record<string, unknown>,
    options?: { authToken?: string },
  ): Promise<unknown> {
    return this.invokeMetaTool('filter_prompts', args, options);
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

  /**
   * Read one of the aggregator's own MCP resources by URI, via a native
   * `resources/read`. Used for `auth://status`, the per-session view of which
   * aggregated servers this user is authenticated to.
   *
   * This deliberately does NOT go through the `get_resource` meta-tool: that one
   * aggregates the resources of the *downstream* servers and never sees
   * `auth://status`, which muster registers on the aggregator's own MCP server
   * (`list_resources` reports "No resources available" against a muster whose
   * downstream servers expose none). muster's own CLI reads it the same way --
   * `mcp.ReadResourceRequest` in `cmd/auth_helpers.go`.
   *
   * Resource contents are JSON text; the first text block is parsed.
   */
  async getResource(
    uri: string,
    options?: { authToken?: string },
  ): Promise<unknown> {
    const { client, cacheKey } = await this.connect(options);

    let result;
    try {
      result = await client.readResource({ uri });
    } catch (error) {
      this.handleRequestError(error, cacheKey);
      throw error;
    }

    const text = result.contents.find(
      (content): content is typeof content & { text: string } =>
        typeof (content as { text?: unknown }).text === 'string',
    )?.text;

    if (text === undefined) {
      throw new ServiceUnavailableError(
        `Muster resource ${uri} returned no text content`,
      );
    }

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  async dispose(): Promise<void> {
    await this.cache.dispose();
  }

  /**
   * Unwrap an MCP tool result's first text content block. Tool-level errors
   * (isError) surface as exceptions with the error text.
   *
   * muster's `call_tool` mirrors the wrapped tool's isError onto its own
   * envelope, so an errored envelope carries the serialized inner MCP result
   * as its text — the thrown message must be the inner human-readable text,
   * not that JSON structure (which the UI would otherwise show verbatim).
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
        (text === undefined ? undefined : errorTextOf(text)) ??
          `Muster tool ${toolName} failed without an error message`,
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
