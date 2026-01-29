import { Config } from '@backstage/config';
import { LoggerService } from '@backstage/backend-plugin-api';
import { Tool, ToolSet } from 'ai';
import { experimental_createMCPClient as createMCPClient } from '@ai-sdk/mcp';

export interface McpToolsResult {
  tools: ToolSet;
  failedServers: Array<{ name: string; error: string }>;
}

export async function getMcpTools(
  config: Config,
  logger: LoggerService,
): Promise<McpToolsResult> {
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
  const failedServers: Array<{ name: string; error: string }> = [];

  for (const [name, { url, headers }] of Object.entries(mcpServers)) {
    try {
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
      logger.debug(`Successfully loaded tools from MCP server: ${name}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.warn(
        `Failed to connect to MCP server '${name}' at ${url}: ${errorMessage}`,
      );
      failedServers.push({ name, error: errorMessage });
    }
  }

  return { tools, failedServers };
}
