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

// Muster workflow tools proxied by this plugin. The muster aggregator only
// exposes its meta-tools (list_tools, call_tool, ...) over MCP; concrete
// tools like core_workflow_list must be invoked through the `call_tool`
// meta-tool with the target tool name and arguments.
const WORKFLOW_TOOL_NAMES = [
  'core_workflow_list',
  'core_workflow_get',
  'core_workflow_execution_list',
  'core_workflow_execution_get',
] as const;

export type WorkflowToolName = (typeof WORKFLOW_TOOL_NAMES)[number];

/** Muster meta-tool used to execute any aggregated tool by name. */
const CALL_TOOL = 'call_tool';

const CACHE_KEY_SERVER_NAME = 'muster';

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
 * Resolve the muster MCP server connection from the existing `aiChat.mcp`
 * config array, so deployments configure the muster endpoint once. The entry
 * is selected by name (`muster.serverName`, default `muster`) and supports
 * the same plain/static-header rules as ai-chat-backend's
 * readMcpServersFromConfig. Entries with `authProvider` require the
 * frontend to forward a per-user token with each request. Entries with
 * `useBackstageUserToken` are not supported by this proxy and are reported
 * as unconfigured.
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
      `MCP server '${serverName}' is configured with useBackstageUserToken, which the muster backend plugin does not support. Workflow visualization is disabled.`,
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

interface ContentItem {
  type: string;
  text?: string;
}

/**
 * Thin client around the muster MCP server exposing the core workflow tools
 * as typed JSON calls. Connections are cached per user token via the shared
 * McpClientCache (TTL-based and close-detected recreation), so a server
 * behind per-user auth gets one MCP session per user instead of one global
 * session.
 */
export class MusterMcpClient {
  private readonly cache: McpClientCache;

  constructor(
    private readonly server: MusterServerConfig,
    private readonly logger: LoggerService,
    private readonly clientFactory: (
      headers: Record<string, string> | undefined,
    ) => Promise<MCPClient> = headers =>
      createMCPClient({
        name: 'muster-backend',
        transport: {
          type: 'http',
          url: server.url,
          headers,
        },
      }),
  ) {
    this.cache = new McpClientCache(logger);
  }

  async callTool(
    toolName: WorkflowToolName,
    args: Record<string, unknown>,
    options?: { authToken?: string },
  ): Promise<unknown> {
    const authToken = options?.authToken;
    const cacheKey = McpClientCache.buildKey(CACHE_KEY_SERVER_NAME, authToken);

    const headers: Record<string, string> | undefined =
      authToken !== undefined
        ? { ...this.server.headers, Authorization: `Bearer ${authToken}` }
        : this.server.headers;

    if (!WORKFLOW_TOOL_NAMES.includes(toolName)) {
      throw new NotFoundError(`Unknown muster tool: ${toolName}`);
    }

    const client = await this.cache.getOrCreate(cacheKey, () =>
      this.clientFactory(headers),
    );
    const tools = client.toolsFromDefinitions({
      tools: [{ name: CALL_TOOL, inputSchema: { type: 'object' as const } }],
    });

    const tool = tools[CALL_TOOL];
    if (!tool || typeof tool.execute !== 'function') {
      throw new ServiceUnavailableError(
        `Muster meta-tool ${CALL_TOOL} has no executor`,
      );
    }

    let result;
    try {
      result = await tool.execute(
        { name: toolName, arguments: args },
        {
          toolCallId: `muster-backend-${toolName}`,
          messages: [],
        },
      );
    } catch (error) {
      if (isClosedClientError(error)) {
        this.logger.warn(
          `Muster MCP client returned a closed-client error; reconnecting on the next request.`,
        );
        this.cache.markDead(cacheKey);
      }
      throw error;
    }

    return this.parseResult(result, toolName);
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
   * The `call_tool` meta-tool wraps the target tool's MCP result as a JSON
   * string inside its own text content block, so unwrap twice: first the
   * meta-tool envelope, then the target tool's result, whose text payload is
   * the JSON document the workflow endpoints return.
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
      // Not a call_tool envelope; treat it as the tool's direct payload.
      return envelope;
    }

    if (
      inner === null ||
      typeof inner !== 'object' ||
      !Array.isArray((inner as { content?: unknown }).content)
    ) {
      // Direct JSON payload from a server that exposes tools without the
      // call_tool envelope.
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
