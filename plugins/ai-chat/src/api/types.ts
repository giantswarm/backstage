import { createApiRef } from '@backstage/core-plugin-api';

export interface MCPAuthCredentials {
  token?: string;
}

export interface MCPAuthProvidersApi {
  getCredentials(authProvider: string): Promise<MCPAuthCredentials>;
}

export const mcpAuthProvidersApiRef = createApiRef<MCPAuthProvidersApi>({
  id: 'plugin.ai-chat.mcp-auth-providers',
});
