import { Config } from '@backstage/config';
import { LoggerService } from '@backstage/backend-plugin-api';
import { Tool, ToolSet } from 'ai';
import {
  experimental_createMCPClient as createMCPClient,
  MCPClient,
} from '@ai-sdk/mcp';
import { AuthTokens } from './utils';
import { McpClientCache } from './McpClientCache';

interface McpServerConfig {
  url: string;
  headers?: Record<string, string>;
  installation?: string;
  authToken?: string;
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
): Record<string, McpServerConfig> {
  const mcpServers: Record<string, McpServerConfig> = {};

  const mcpConfigs = config.getOptionalConfigArray('aiChat.mcp');
  if (mcpConfigs && mcpConfigs.length > 0) {
    mcpConfigs.forEach(mcp => {
      const name = mcp.getString('name');
      const url = mcp.getString('url');
      const installation = mcp.getOptionalString('installation');

      // Rule 1: If authProvider is set, check if token exists
      const authProvider = mcp.getOptionalString('authProvider');
      if (authProvider) {
        const token = authTokens[authProvider];
        if (!token) {
          return; // Skip if no token available
        }

        mcpServers[name] = {
          url,
          headers: { Authorization: `Bearer ${token}` },
          installation,
          authToken: token,
        };

        return;
      }

      // Rule 2: If headers configured, add server with those headers
      const headers = getMcpServerHeaders(mcp);
      if (headers) {
        mcpServers[name] = { url, headers, installation };

        return;
      }

      // Rule 3: No headers and no authProvider, just add server
      mcpServers[name] = { url, installation };
    });
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
    logger.info(`Successfully loaded resources from MCP server: ${serverName}`);
  } catch (resourceError: any) {
    // Log a concise message if resources aren't supported
    if (resourceError?.message?.includes('does not support resources')) {
      logger.info(
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

function collectTools(mcpClientTools: ToolSet, installation?: string): ToolSet {
  const tools: ToolSet = {};
  Object.entries(mcpClientTools).forEach(([toolName, tool]) => {
    const toolInstance = tool as Tool;

    if (installation) {
      toolInstance.description = `${toolInstance.description} (for installation: ${installation})`;
      const prefixedToolName = `${installation}_${toolName}`;
      tools[prefixedToolName] = toolInstance;
    } else {
      tools[toolName] = toolInstance;
    }
  });
  return tools;
}

async function getTools(
  mcpClient: MCPClient,
  serverName: string,
  logger: LoggerService,
  installation?: string,
): Promise<ToolSet> {
  try {
    const mcpClientTools = (await mcpClient.tools()) as ToolSet;
    const tools = collectTools(mcpClientTools, installation);
    logger.info(`Successfully loaded tools from MCP server: ${serverName}`);
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

export async function getMcpTools(
  config: Config,
  authTokens: AuthTokens,
  logger: LoggerService,
  clientCache: McpClientCache,
): Promise<McpToolsResult> {
  const mcpServers = readMcpServersFromConfig(config, authTokens);

  const tools: ToolSet = {};
  const resources: { [resourceName: string]: string } = {};
  const failedServers: Array<{ name: string; error: string }> = [];
  const connectedServers: string[] = [];

  for (const [serverName, server] of Object.entries(mcpServers)) {
    const cacheKey = McpClientCache.buildKey(serverName, server.authToken);

    try {
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
      Object.assign(resources, serverResources);

      const serverTools = await getTools(
        mcpClient,
        serverName,
        logger,
        server.installation,
      );
      Object.assign(tools, serverTools);
      connectedServers.push(serverName);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(
        `Failed to connect to MCP server '${serverName}' at ${server.url}: ${errorMessage}`,
      );
      failedServers.push({ name: serverName, error: errorMessage });
      // Evict broken session so the next request retries
      await clientCache.invalidate(cacheKey);
    }
  }

  return { tools, resources, failedServers, connectedServers };
}
