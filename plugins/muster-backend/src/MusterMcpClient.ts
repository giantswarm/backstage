import { LoggerService } from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import { NotFoundError } from '@backstage/errors';
import {
  experimental_createMCPClient as createMCPClient,
  MCPClient,
} from '@ai-sdk/mcp';

// Muster workflow tools proxied by this plugin. Definitions are passed to
// `toolsFromDefinitions` so we never have to list the (potentially huge)
// aggregated muster tool catalog just to call four core tools.
const WORKFLOW_TOOL_NAMES = [
  'core_workflow_list',
  'core_workflow_get',
  'core_workflow_execution_list',
  'core_workflow_execution_get',
] as const;

export type WorkflowToolName = (typeof WORKFLOW_TOOL_NAMES)[number];

const CLIENT_TTL_MS = 30 * 60 * 1000; // 30 minutes

// Matches @ai-sdk/mcp's MCPClientError thrown from request() once the
// transport closed. Same self-healing signal as ai-chat-backend's
// McpClientCache (see plugins/ai-chat-backend/src/McpClientCache.ts).
const CLOSED_CLIENT_ERROR_FRAGMENT =
  'Attempted to send a request from a closed client';

export function isClosedClientError(error: unknown): boolean {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes(CLOSED_CLIENT_ERROR_FRAGMENT);
}

interface MusterServerConfig {
  url: string;
  headers?: Record<string, string>;
}

/**
 * Resolve the muster MCP server connection from the existing `aiChat.mcp`
 * config array, so deployments configure the muster endpoint once. The entry
 * is selected by name (`muster.serverName`, default `muster`) and supports
 * the same plain/static-header rules as ai-chat-backend's
 * readMcpServersFromConfig. Entries that need per-user auth
 * (`authProvider`, `useBackstageUserToken`) are not supported by this
 * server-side proxy and are reported as unconfigured.
 */
export function readMusterServerFromConfig(
  config: Config,
  logger: LoggerService,
): MusterServerConfig | undefined {
  const serverName = config.getOptionalString('muster.serverName') ?? 'muster';

  const mcpConfigs = config.getOptionalConfigArray('aiChat.mcp');
  const mcpConfig = mcpConfigs?.find(
    mcp => mcp.getString('name') === serverName,
  );
  if (!mcpConfig) {
    return undefined;
  }

  if (
    mcpConfig.getOptionalBoolean('useBackstageUserToken') ||
    mcpConfig.getOptionalString('authProvider')
  ) {
    logger.warn(
      `MCP server '${serverName}' requires per-user auth (authProvider/useBackstageUserToken), which the muster backend plugin does not support. Workflow visualization is disabled.`,
    );
    return undefined;
  }

  const url = mcpConfig.getString('url');

  const headersConfig = mcpConfig.getOptionalConfig('headers');
  let headers: Record<string, string> | undefined;
  if (headersConfig) {
    headers = {};
    for (const key of headersConfig.keys()) {
      headers[key] = headersConfig.getString(key);
    }
  }

  return { url, headers };
}

interface CacheEntry {
  clientPromise: Promise<MCPClient>;
  createdAt: number;
  alive: boolean;
}

interface ContentItem {
  type: string;
  text?: string;
}

/**
 * Thin client around the muster MCP server exposing the core workflow tools
 * as typed JSON calls. Maintains a single cached MCP client (the proxy only
 * ever talks to one server) with TTL-based and close-detected recreation.
 */
export class MusterMcpClient {
  private entry: CacheEntry | undefined;

  constructor(
    server: MusterServerConfig,
    private readonly logger: LoggerService,
    private readonly clientFactory: () => Promise<MCPClient> = () =>
      createMCPClient({
        name: 'muster-backend',
        transport: {
          type: 'http',
          url: server.url,
          headers: server.headers,
        },
      }),
  ) {}

  async callTool(
    toolName: WorkflowToolName,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const client = await this.getClient();
    const tools = client.toolsFromDefinitions({
      tools: WORKFLOW_TOOL_NAMES.map(name => ({
        name,
        inputSchema: { type: 'object' as const },
      })),
    });

    const tool = tools[toolName];
    if (!tool) {
      throw new NotFoundError(`Unknown muster tool: ${toolName}`);
    }

    let result;
    try {
      result = await tool.execute!(args, {
        toolCallId: `muster-backend-${toolName}`,
        messages: [],
      });
    } catch (error) {
      if (isClosedClientError(error) && this.entry) {
        this.logger.warn(
          `Muster MCP client returned a closed-client error; reconnecting on the next request.`,
        );
        this.entry.alive = false;
      }
      throw error;
    }

    return this.parseResult(result, toolName);
  }

  async dispose(): Promise<void> {
    const entry = this.entry;
    this.entry = undefined;
    if (!entry) return;
    try {
      const client = await entry.clientPromise;
      await client.close();
    } catch {
      // Client may have already failed; ignore.
    }
  }

  private async getClient(): Promise<MCPClient> {
    const existing = this.entry;
    if (
      existing &&
      existing.alive &&
      Date.now() - existing.createdAt < CLIENT_TTL_MS
    ) {
      return existing.clientPromise;
    }

    if (existing) {
      this.logger.debug(
        'Muster MCP client expired or closed; creating a new connection',
      );
      // Close the old client in the background; don't block the request.
      existing.clientPromise.then(client => client.close()).catch(() => {});
    }

    const entry: CacheEntry = {
      clientPromise: undefined as unknown as Promise<MCPClient>,
      createdAt: Date.now(),
      alive: true,
    };

    entry.clientPromise = this.clientFactory()
      .then(client => {
        // Chain into the transport's onclose hook so the cache learns when
        // the connection has been torn down (idle timeout, network drop).
        try {
          const transport = (
            client as unknown as {
              transport?: { onclose?: (...cbArgs: unknown[]) => void };
            }
          ).transport;
          if (transport) {
            const previous = transport.onclose;
            transport.onclose = (...cbArgs: unknown[]) => {
              entry.alive = false;
              try {
                previous?.(...cbArgs);
              } catch {
                // Don't let chaining surface as an unhandled rejection.
              }
            };
          }
        } catch {
          // Without the hook the TTL still bounds staleness.
        }
        return client;
      })
      .catch(err => {
        if (this.entry === entry) {
          this.entry = undefined;
        }
        throw err;
      });

    this.entry = entry;
    return entry.clientPromise;
  }

  /**
   * Muster returns JSON payloads serialized into MCP text content blocks.
   * Unwrap the first text block and parse it; tool-level errors (isError)
   * surface as exceptions with the error text.
   */
  private parseResult(result: unknown, toolName: string): unknown {
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
