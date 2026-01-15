import { Config } from '@backstage/config';
import { ToolSet } from 'ai';
import { experimental_createMCPClient as createMCPClient } from '@ai-sdk/mcp';

export async function getMcpTools(config: Config) {
  const mcpConfigs = config.getOptionalConfigArray('aiChat.mcp');
  const mcpServers: Record<
    string,
    { url: string; headers?: Record<string, string> }
  > = {};
  if (mcpConfigs && mcpConfigs.length > 0) {
    mcpConfigs.forEach(mcp => {
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
      mcpServers[name] = { url, headers };
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
      tools[toolName] = tool;
    });
  }

  return tools;
}
