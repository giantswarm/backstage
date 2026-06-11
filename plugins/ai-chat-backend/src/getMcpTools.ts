import { Config } from '@backstage/config';
import { LoggerService } from '@backstage/backend-plugin-api';
import { Tool, ToolSet } from 'ai';
import {
  experimental_createMCPClient as createMCPClient,
  MCPClient,
} from '@ai-sdk/mcp';
import { AuthTokens } from './utils';
import {
  isClosedClientError,
  McpClientCache,
} from '@giantswarm/backstage-plugin-gs-node';

interface McpServerConfig {
  url: string;
  headers?: Record<string, string>;
  installation?: string;
  authToken?: string;
  timeoutMs?: number;
}

/**
 * Upper bound for connecting to an MCP server and loading its resources
 * and tools. Without it a single unresponsive server hangs the whole chat
 * request forever (observed in production when an MCP server's responses
 * were silently dropped by the transport). Override per server with
 * `aiChat.mcp[].timeoutMs`.
 */
const DEFAULT_MCP_SERVER_TIMEOUT_MS = 15_000;

export interface BackstageUserContext {
  userEntityRef: string;
  mcpActionsToken: string;
}

function getMcpServerHeaders(mcpConfig: Config): Record<string, string> {
  const serverHeaders = mcpConfig.getOptionalConfig('headers');
  const headers: Record<string, string> = {};
  if (serverHeaders) {
    const keys = serverHeaders.keys();
    for (const key of keys) {
      headers[key] = serverHeaders.getString(key);
    }
  }

  return headers;
}

function readMcpServersFromConfig(
  config: Config,
  authTokens: AuthTokens,
  backstageUser: BackstageUserContext | undefined,
): Record<string, McpServerConfig> {
  const mcpServers: Record<string, McpServerConfig> = {};

  const mcpConfigs = config.getOptionalConfigArray('aiChat.mcp');
  if (!mcpConfigs || mcpConfigs.length === 0) {
    return mcpServers;
  }

  for (const mcp of mcpConfigs) {
    const name = mcp.getString('name');
    const url = mcp.getString('url');
    const installation = mcp.getOptionalString('installation');
    const timeoutMs = mcp.getOptionalNumber('timeoutMs');

    // Rule 1: Forward a Backstage token minted on behalf of the calling
    // user, scoped to the built-in `mcp-actions` plugin. Use this for
    // the in-process MCP server so calls run as the logged-in user.
    const useBackstageUserToken = mcp.getOptionalBoolean(
      'useBackstageUserToken',
    );
    if (useBackstageUserToken) {
      if (!backstageUser) {
        continue;
      }

      const extraHeaders = getMcpServerHeaders(mcp);
      mcpServers[name] = {
        url,
        headers: {
          ...extraHeaders,
          Authorization: `Bearer ${backstageUser.mcpActionsToken}`,
        },
        installation,
        // Stable per-user cache key so the cache survives across
        // requests despite the Authorization token being minted fresh.
        authToken: `bs-user:${backstageUser.userEntityRef}`,
        timeoutMs,
      };

      continue;
    }

    // Rule 2: If authProvider is set, check if token exists
    const authProvider = mcp.getOptionalString('authProvider');
    if (authProvider) {
      const token = authTokens[authProvider];
      if (!token) {
        continue; // Skip if no token available
      }

      mcpServers[name] = {
        url,
        headers: { Authorization: `Bearer ${token}` },
        installation,
        authToken: token,
        timeoutMs,
      };

      continue;
    }

    // Rule 3: If headers configured, add server with those headers
    const headers = getMcpServerHeaders(mcp);
    if (headers) {
      mcpServers[name] = { url, headers, installation, timeoutMs };
      continue;
    }

    // Rule 4: No headers and no authProvider, just add server
    mcpServers[name] = { url, installation, timeoutMs };
  }

  return mcpServers;
}

async function getResources(
  mcpClient: MCPClient,
  serverName: string,
  logger: LoggerService,
): Promise<{ [resourceName: string]: string }> {
  const resources: { [resourceName: string]: string } = {};

  try {
    const listResources = await mcpClient.listResources();

    for (const { name, uri } of listResources.resources) {
      const resource = await mcpClient.readResource({ uri });
      resources[name] = (resource.contents[0]?.text as string) ?? '';
    }
    logger.debug(
      `Successfully loaded resources from MCP server: ${serverName}`,
    );
  } catch (resourceError: any) {
    // Log a concise message if resources aren't supported
    if (resourceError?.message?.includes('does not support resources')) {
      logger.debug(
        `MCP server ${serverName} does not support resources, skipping resource loading`,
      );
    } else {
      logger.error(
        `Failed to load resources from MCP server ${serverName}:`,
        resourceError?.message || resourceError,
      );
    }
  }

  return resources;
}

/**
 * Sanitize a tool name to match the AI SDK pattern: ^[a-zA-Z0-9_-]{1,128}$
 */
function sanitizeToolName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/_$/, '')
    .substring(0, 128);
}

// Wrap a Tool's `execute` so a "closed client" error from the
// underlying MCP transport eagerly marks the cache entry dead. This
// turns a multi-turn retry loop ("I'm getting 'closed client' errors
// from the Kubernetes MCP server, let me try once more...") into at
// most one stale call followed by a clean reconnect on the next chat
// request, while still surfacing the failure to the LLM for the
// current turn so it can react.
function wrapToolWithClosedClientDetection(
  tool: Tool,
  onClosedClientError: () => void,
  logger: LoggerService,
  serverName: string,
  toolName: string,
): Tool {
  const original = (tool as { execute?: Function }).execute;
  if (typeof original !== 'function') return tool;

  return {
    ...tool,
    execute: async (...args: unknown[]) => {
      try {
        return await (original as Function).apply(tool, args);
      } catch (err) {
        if (isClosedClientError(err)) {
          logger.warn(
            `MCP tool '${toolName}' on server '${serverName}' returned a closed-client error; marking cache entry dead so the next request reconnects.`,
          );
          try {
            onClosedClientError();
          } catch {
            // Don't let bookkeeping mask the real tool error.
          }
        }
        throw err;
      }
    },
  } as Tool;
}

function collectTools(
  mcpClientTools: ToolSet,
  installation: string | undefined,
  serverName: string,
  logger: LoggerService,
  onClosedClientError: () => void,
): ToolSet {
  const tools: ToolSet = {};
  Object.entries(mcpClientTools).forEach(([toolName, tool]) => {
    const toolInstance = tool as Tool;

    if (installation) {
      toolInstance.description = `${toolInstance.description} (for installation: ${installation})`;
      const prefixedToolName = sanitizeToolName(`${installation}_${toolName}`);
      tools[prefixedToolName] = wrapToolWithClosedClientDetection(
        toolInstance,
        onClosedClientError,
        logger,
        serverName,
        prefixedToolName,
      );
    } else {
      const safeName = sanitizeToolName(toolName);
      tools[safeName] = wrapToolWithClosedClientDetection(
        toolInstance,
        onClosedClientError,
        logger,
        serverName,
        safeName,
      );
    }
  });
  return tools;
}

async function getTools(
  mcpClient: MCPClient,
  serverName: string,
  logger: LoggerService,
  onClosedClientError: () => void,
  installation?: string,
): Promise<ToolSet> {
  try {
    const mcpClientTools = (await mcpClient.tools()) as ToolSet;
    const tools = collectTools(
      mcpClientTools,
      installation,
      serverName,
      logger,
      onClosedClientError,
    );
    logger.debug(`Successfully loaded tools from MCP server: ${serverName}`);
    return tools;
  } catch (toolError) {
    const errorMessage =
      toolError instanceof Error ? toolError.message : String(toolError);
    logger.error(
      `Failed to load tools from MCP server ${serverName}: ${errorMessage}`,
    );
  }

  return {};
}

export interface McpToolsResult {
  tools: ToolSet;
  resources: { [resourceName: string]: string };
  failedServers: Array<{ name: string; error: string }>;
  connectedServers: string[];
}

interface ServerLoadResult {
  serverName: string;
  tools?: ToolSet;
  resources?: { [resourceName: string]: string };
  error?: string;
}

async function loadServer(
  serverName: string,
  server: McpServerConfig,
  logger: LoggerService,
  clientCache: McpClientCache,
): Promise<ServerLoadResult> {
  const cacheKey = McpClientCache.buildKey(serverName, server.authToken);
  const timeoutMs = server.timeoutMs ?? DEFAULT_MCP_SERVER_TIMEOUT_MS;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            `Timed out after ${timeoutMs}ms waiting for MCP server '${serverName}'`,
          ),
        ),
      timeoutMs,
    );
    timer.unref?.();
  });

  try {
    const load = (async () => {
      const mcpClient = await clientCache.getOrCreate(cacheKey, () =>
        createMCPClient({
          name: serverName,
          transport: {
            type: 'http',
            url: server.url,
            headers: server.headers,
          },
        }),
      );

      const serverResources = await getResources(mcpClient, serverName, logger);
      const serverTools = await getTools(
        mcpClient,
        serverName,
        logger,
        () => clientCache.markDead(cacheKey),
        server.installation,
      );

      return { serverName, tools: serverTools, resources: serverResources };
    })();

    return await Promise.race([load, timeout]);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      `Failed to connect to MCP server '${serverName}' at ${server.url}: ${errorMessage}`,
    );
    // Evict the broken session so the next request retries. Not awaited:
    // invalidate awaits the cached client promise before closing it, which
    // may itself never settle when the server is hanging.
    void clientCache.invalidate(cacheKey).catch(() => {});
    return { serverName, error: errorMessage };
  } finally {
    clearTimeout(timer);
  }
}

export async function getMcpTools(
  config: Config,
  authTokens: AuthTokens,
  backstageUser: BackstageUserContext | undefined,
  logger: LoggerService,
  clientCache: McpClientCache,
): Promise<McpToolsResult> {
  const mcpServers = readMcpServersFromConfig(
    config,
    authTokens,
    backstageUser,
  );

  const tools: ToolSet = {};
  const resources: { [resourceName: string]: string } = {};
  const failedServers: Array<{ name: string; error: string }> = [];
  const connectedServers: string[] = [];

  // Load all servers in parallel; each is individually bounded by its
  // timeout so one slow or hanging server neither delays nor blocks the
  // others. Results are merged in config order to keep tool precedence
  // deterministic.
  const results = await Promise.all(
    Object.entries(mcpServers).map(([serverName, server]) =>
      loadServer(serverName, server, logger, clientCache),
    ),
  );

  for (const result of results) {
    if (result.error !== undefined) {
      failedServers.push({ name: result.serverName, error: result.error });
    } else {
      Object.assign(resources, result.resources);
      Object.assign(tools, result.tools);
      connectedServers.push(result.serverName);
    }
  }

  return { tools, resources, failedServers, connectedServers };
}
