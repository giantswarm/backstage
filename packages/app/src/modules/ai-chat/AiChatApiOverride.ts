import { ApiBlueprint } from '@backstage/frontend-plugin-api';
import {
  mcpAuthProvidersApiRef,
  MCPAuthProviders,
} from '@giantswarm/backstage-plugin-ai-chat';
import { gsAuthProvidersApiRef } from '@giantswarm/backstage-plugin-gs';

export const AiChatApiOverride = ApiBlueprint.make({
  name: 'mcp-auth-providers',
  params: defineParams =>
    defineParams({
      api: mcpAuthProvidersApiRef,
      deps: { gsAuthProvidersApi: gsAuthProvidersApiRef },
      factory: ({ gsAuthProvidersApi }) => {
        const authProviders = gsAuthProvidersApi.getMCPAuthApis();
        return new MCPAuthProviders(authProviders);
      },
    }),
});
