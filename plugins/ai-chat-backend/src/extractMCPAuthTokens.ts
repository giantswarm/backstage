import { IncomingHttpHeaders } from 'http';

export type AuthTokens = { [authProvider: string]: string };

const MCP_AUTH_HEADER_PREFIX = 'backstage-ai-chat-authorization-';

export function extractMCPAuthTokens(headers: IncomingHttpHeaders): AuthTokens {
  const tokensByAuthProvider = new Map<string, string>();

  for (const [headerName, headerValue] of Object.entries(headers)) {
    const lowerHeaderName = headerName.toLowerCase();
    if (lowerHeaderName.startsWith(MCP_AUTH_HEADER_PREFIX)) {
      const authProvider = lowerHeaderName.slice(MCP_AUTH_HEADER_PREFIX.length);
      if (authProvider && typeof headerValue === 'string') {
        tokensByAuthProvider.set(authProvider, headerValue);
      }
    }
  }

  return Object.fromEntries(tokensByAuthProvider);
}
