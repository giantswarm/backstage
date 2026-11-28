import { useCallback } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { getSignedInConfig } from '@giantswarm/backstage-plugin-gs-react';
import { mcpAuthProvidersApiRef } from '../api';

/**
 * The distinct `authProvider` names of `aiChat.mcp` in the signed-in config:
 * the providers whose tokens ride along with every chat request.
 */
async function mcpAuthProvidersFromConfig(): Promise<string[]> {
  const config = await getSignedInConfig();
  const mcpServers = config.getOptionalConfigArray('aiChat.mcp');
  if (!mcpServers) {
    return [];
  }

  const providers: string[] = [];
  for (const serverConfig of mcpServers) {
    const authProvider = serverConfig.getOptionalString('authProvider');
    if (authProvider && !providers.includes(authProvider)) {
      providers.push(authProvider);
    }
  }

  return providers;
}

/**
 * The headers that carry the person's token for each `authProvider` of
 * `aiChat.mcp` to the AI chat backend, one per provider the person holds a
 * token for.
 */
export function useMcpAuthHeaders(): () => Promise<Record<string, string>> {
  const mcpAuthProvidersApi = useApi(mcpAuthProvidersApiRef);

  return useCallback(async () => {
    const mcpHeaders: Record<string, string> = {};

    // The MCP server list is part of the signed-in config, which has loaded
    // by the time a message is sent; awaiting it (rather than reading a
    // snapshot) means the first message can never go out without its tokens.
    const mcpAuthProviders = await mcpAuthProvidersFromConfig();

    const results = await Promise.allSettled(
      mcpAuthProviders.map(async authProvider => {
        const credentials =
          await mcpAuthProvidersApi.getCredentials(authProvider);
        if (credentials.token) {
          return { authProvider, authToken: credentials.token };
        }

        return null;
      }),
    );

    results.forEach(result => {
      if (result.status === 'fulfilled' && result.value) {
        const { authProvider, authToken } = result.value;
        mcpHeaders[`backstage-ai-chat-authorization-${authProvider}`] =
          authToken;
      }
    });

    return mcpHeaders;
  }, [mcpAuthProvidersApi]);
}
