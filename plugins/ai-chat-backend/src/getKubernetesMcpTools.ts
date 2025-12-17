import { Config } from '@backstage/config';
import { ToolSet } from 'ai';
import { experimental_createMCPClient as createMCPClient } from '@ai-sdk/mcp';
import { ClusterToken } from './extractKubernetesAuthTokens';

export async function getKubernetesMcpTools(
  kubernetesAuthTokens: ClusterToken[],
  config: Config,
) {
  if (kubernetesAuthTokens.length === 0) {
    return [];
  }

  const mcpConfigs = config.getOptionalConfigArray('aiChat.mcp');
  const kubernetesMcpServers: Record<string, string> = {};
  if (mcpConfigs && mcpConfigs.length > 0) {
    mcpConfigs.forEach(mcp => {
      const serverName = mcp.getString('name');
      const serverUrl = mcp.getString('url');
      if (serverName.startsWith('kubernetes-mcp')) {
        kubernetesMcpServers[serverName] = serverUrl;
      }
    });
  }

  const tools: ToolSet = {};
  for (const kubernetesAuthToken of kubernetesAuthTokens) {
    const { clusterName, token } = kubernetesAuthToken;
    const mcpServerName = `kubernetes-mcp-${clusterName}`;
    const mcpServerUrl = kubernetesMcpServers[mcpServerName];
    if (mcpServerUrl) {
      const mcpClient = await createMCPClient({
        name: mcpServerName,
        transport: {
          type: 'http',
          url: mcpServerUrl,
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      });

      const mcpClientTools = await mcpClient.tools();
      Object.entries(mcpClientTools).forEach(([toolName, tool]) => {
        tool.description = `${tool.description} (for cluster: ${clusterName})`;
        tools[`${clusterName}_${toolName}`] = tool;
      });
    }
  }

  return tools;
}
