import { Config } from '@backstage/config';
import { Tool, ToolSet } from 'ai';
import { experimental_createMCPClient as createMCPClient } from '@ai-sdk/mcp';
import { AuthTokens } from './extractMCPAuthTokens';

export async function getMcpTools(config: Config, authTokens: AuthTokens) {
  const mcpConfigs = config.getOptionalConfigArray('aiChat.mcp');
  const mcpServers: Record<
    string,
    { url: string; headers?: Record<string, string>; installation?: string }
  > = {};
  if (mcpConfigs && mcpConfigs.length > 0) {
    mcpConfigs.forEach(mcp => {
      const name = mcp.getString('name');
      const url = mcp.getString('url');
      const installation = mcp.getOptionalString('installation');

      const authProvider = mcp.getOptionalString('authProvider');
      const serverHeaders = mcp.getOptionalConfig('headers');

      // Rule 1: If authProvider is set, check if token exists
      if (authProvider) {
        const token = authTokens[authProvider];
        if (token) {
          mcpServers[name] = {
            url,
            headers: { Authorization: `Bearer ${token}` },
            installation,
          };
        }
        // Skip if no token available
        return;
      }

      // Rule 2: If headers configured, add server with those headers
      if (serverHeaders) {
        const headers: Record<string, string> = {};
        const keys = serverHeaders.keys();
        for (const key of keys) {
          headers[key] = serverHeaders.getString(key);
        }
        mcpServers[name] = { url, headers, installation };
        return;
      }

      // Rule 3: No headers and no authProvider, just add server
      mcpServers[name] = { url, installation };
    });
  }

  const tools: ToolSet = {};
  const allResources: { [resourceName: string]: string } = {};

  for (const [serverName, { url, headers, installation }] of Object.entries(
    mcpServers,
  )) {
    try {
      const mcpClient = await createMCPClient({
        name: serverName,
        transport: {
          type: 'http',
          url,
          headers,
        },
      });

      // Try to get resources, but don't fail if the server doesn't support them
      try {
        const listResources = await mcpClient.listResources();

        const resources: { [resourceName: string]: string } = {};
        for (const { name, uri } of listResources.resources) {
          const resource = await mcpClient.readResource({ uri });
          resources[name] = (resource.contents[0]?.text as string) ?? '';
        }

        // Accumulate resources from all servers
        Object.assign(allResources, resources);
      } catch (resourceError: any) {
        // Log a concise message if resources aren't supported
        if (resourceError?.message?.includes('does not support resources')) {
          console.log(
            `MCP server ${serverName} does not support resources, skipping resource loading`,
          );
        } else {
          console.warn(
            `Failed to load resources from MCP server ${serverName}:`,
            resourceError?.message || resourceError,
          );
        }
      }

      const mcpClientTools = await mcpClient.tools();
      Object.entries(mcpClientTools).forEach(([toolName, tool]) => {
        const toolInstance = tool as Tool;

        if (installation) {
          // Prefix tool name and description with installation
          toolInstance.description = `${toolInstance.description} (for installation: ${installation})`;
          const prefixedToolName = `${installation}_${toolName}`;
          tools[prefixedToolName] = toolInstance;
        } else {
          tools[toolName] = toolInstance;
        }
      });
    } catch (error: any) {
      console.error(
        `Failed to connect to MCP server ${serverName}:`,
        error?.message || error,
      );
      // Continue with other servers
    }
  }

  return { tools, resources: allResources };
}
