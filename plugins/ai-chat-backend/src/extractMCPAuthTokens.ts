import { UIMessage } from 'ai';

interface MCPAuthOutput {
  authProvider: string;
  token: string;
}

export type AuthTokens = { [authProvider: string]: string };

export function extractMCPAuthTokens(messages: UIMessage[]): AuthTokens {
  const tokensByAuthProvider = new Map<string, string>();

  for (const message of messages) {
    for (const part of message.parts) {
      if (
        part.type.startsWith('tool-mcp-auth') &&
        'output' in part &&
        part.output
      ) {
        const partOutput = part.output as MCPAuthOutput;
        tokensByAuthProvider.set(partOutput.authProvider, partOutput.token);
      }
    }
  }

  return Object.fromEntries(tokensByAuthProvider);
}
