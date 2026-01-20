import { Config } from '@backstage/config';
import { LoggerService } from '@backstage/backend-plugin-api';
import { Tool, ToolSet } from 'ai';
import { experimental_createMCPClient as createMCPClient } from '@ai-sdk/mcp';

const MCP_PROVIDER_PREFIX = 'mcp-';

interface McpServerConfig {
  name: string;
  url: string;
  headers?: Record<string, string>;
  requiresAuth?: boolean;
}

/**
 * Get MCP tools from configured MCP servers.
 *
 * This function handles two types of MCP servers:
 * 1. Static servers (aiChat.mcp) - servers with pre-configured headers/auth
 * 2. Authenticated servers (auth.providers with mcp-* prefix) - servers requiring OAuth authentication
 *
 * For authenticated servers, the mcpTokens parameter should contain access tokens
 * obtained from the frontend OAuth flow.
 *
 * @param config - Backstage config
 * @param mcpTokens - Map of server name to OAuth access token
 * @param logger - Optional logger for debugging
 */
export async function getMcpTools(
  config: Config,
  mcpTokens: Record<string, string> = {},
  logger?: LoggerService,
) {
  const mcpServers: McpServerConfig[] = [];

  // Get static MCP servers from aiChat.mcp config
  const staticMcpConfigs = config.getOptionalConfigArray('aiChat.mcp') ?? [];
  for (const mcp of staticMcpConfigs) {
    const name = mcp.getString('name');
    const url = mcp.getString('url');
    const serverHeaders = mcp.getOptionalConfig('headers');
    const headers: Record<string, string> = {};
    if (serverHeaders) {
      const keys = serverHeaders.keys();
      for (const key of keys) {
        headers[key] = serverHeaders.getString(key);
      }
    }
    mcpServers.push({ name, url, headers, requiresAuth: false });
  }

  // Get authenticated MCP servers from auth.providers config (mcp-* prefix)
  const providersConfig = config.getOptionalConfig('auth.providers');
  const environment =
    config.getOptionalString('auth.environment') ?? 'development';

  const allProviders = providersConfig?.keys() ?? [];
  const mcpProviderIds = allProviders.filter(p =>
    p.startsWith(MCP_PROVIDER_PREFIX),
  );

  for (const providerId of mcpProviderIds) {
    const providerConfig = providersConfig
      ?.getConfig(providerId)
      ?.getOptionalConfig(environment);

    if (!providerConfig) {
      continue;
    }

    // Extract server name from providerId (remove mcp- prefix)
    const name = providerId.replace(MCP_PROVIDER_PREFIX, '');
    const serverUrl = providerConfig.getString('serverUrl');

    // Check if we have a token for this server
    const token = mcpTokens[name];
    if (token) {
      // Add server with OAuth bearer token
      mcpServers.push({
        name,
        url: serverUrl,
        headers: {
          Authorization: `Bearer ${token}`,
        },
        requiresAuth: true,
      });
      logger?.debug(`Adding authenticated MCP server: ${name}`);
    } else {
      logger?.debug(
        `Skipping MCP server ${name} - no token provided (user not authenticated)`,
      );
    }
  }

  const tools: ToolSet = {};

  // Connect to each MCP server and collect tools
  for (const { name, url, headers } of mcpServers) {
    try {
      logger?.debug(`Connecting to MCP server: ${name} at ${url}`);

      const mcpClient = await createMCPClient({
        name,
        transport: {
          type: 'http',
          url,
          headers,
        },
      });

      const mcpClientTools = await mcpClient.tools();
      const toolCount = Object.keys(mcpClientTools).length;
      logger?.debug(`Got ${toolCount} tools from MCP server: ${name}`);

      // Prefix tool names with server name to avoid collisions
      Object.entries(mcpClientTools).forEach(([toolName, tool]) => {
        // Use prefixed name for authenticated servers to make it clear which server they came from
        const prefixedName = `${name}__${toolName}`;
        tools[prefixedName] = tool as Tool;
      });
    } catch (error) {
      logger?.error(`Failed to connect to MCP server ${name}: ${error}`);
      // Continue with other servers even if one fails
    }
  }

  return tools;
}
