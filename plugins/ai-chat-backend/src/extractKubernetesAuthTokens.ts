import { UIMessage } from 'ai';

interface KubernetesAuthOutput {
  clusterName: string;
  token: string;
}

export interface ClusterToken {
  clusterName: string;
  token: string;
}

export function extractKubernetesAuthTokens(
  messages: UIMessage[],
): ClusterToken[] {
  const tokensByCluster = new Map<string, string>();

  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type === 'tool-kubernetesAuth' && part.output) {
        const partOutput = part.output as KubernetesAuthOutput;
        tokensByCluster.set(partOutput.clusterName, partOutput.token);
      }
    }
  }

  return Array.from(tokensByCluster.entries()).map(([clusterName, token]) => ({
    clusterName,
    token,
  }));
}
