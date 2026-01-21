import { Config } from '@backstage/config';
import { Tool, ToolSet } from 'ai';
import { experimental_createMCPClient as createMCPClient } from '@ai-sdk/mcp';
import { AuthTokens } from './extractMCPAuthTokens';

export async function getMcpTools(config: Config, authTokens: AuthTokens) {
  const mcpConfigs = config.getOptionalConfigArray('aiChat.mcp');
  const mcpServers: Record<
    string,
    { url: string; headers?: Record<string, string> }
  > = {};
  if (mcpConfigs && mcpConfigs.length > 0) {
    mcpConfigs.forEach(mcp => {
      const name = mcp.getString('name');
      const url = mcp.getString('url');

      const authProvider = mcp.getOptionalString('authProvider');
      const serverHeaders = mcp.getOptionalConfig('headers');

      // Rule 1: If authProvider is set, check if token exists
      if (authProvider) {
        const token = authTokens[authProvider];
        if (token) {
          mcpServers[name] = {
            url,
            headers: { Authorization: `Bearer ${token}` },
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
        mcpServers[name] = { url, headers };
        return;
      }

      // Rule 3: No headers and no authProvider, just add server
      mcpServers[name] = { url };
    });
  }

  const tools: ToolSet = {};

  for (const [name, { url, headers }] of Object.entries(mcpServers)) {
    const mcpClient = await createMCPClient({
      name,
      transport: {
        type: 'http',
        url,
        headers,
      },
    });

    const mcpClientTools = await mcpClient.tools();
    Object.entries(mcpClientTools).forEach(([toolName, tool]) => {
      tools[toolName] = tool as Tool;
    });
  }

  return tools;
}
