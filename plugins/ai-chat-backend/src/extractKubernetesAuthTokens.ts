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
      const partOutput = part.output as KubernetesAuthOutput;
      if (
        part.type === 'tool-kubernetesAuth' &&
        partOutput &&
        partOutput.clusterName &&
        partOutput.token
      ) {
        tokensByCluster.set(partOutput.clusterName, partOutput.token);
      }
    }
  }

  return Array.from(tokensByCluster.entries()).map(([clusterName, token]) => ({
    clusterName,
    token,
  }));
}
