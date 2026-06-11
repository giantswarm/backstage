import { ApiBlueprint } from '@backstage/frontend-plugin-api';
import {
  mcpAuthProvidersApiRef,
  MCPAuthProviders,
} from '@giantswarm/backstage-plugin-ai-chat';
import { gsAuthProvidersApiRef } from '@giantswarm/backstage-plugin-gs';
import { getOptionalMainAuthApi } from '../auth/getOptionalMainAuthApi';

export const AiChatApiOverride = ApiBlueprint.make({
  name: 'mcp-auth-providers',
  params: defineParams =>
    defineParams({
      api: mcpAuthProvidersApiRef,
      deps: { gsAuthProvidersApi: gsAuthProvidersApiRef },
      factory: ({ gsAuthProvidersApi }) => {
        const authProviders = gsAuthProvidersApi.getMCPAuthApis();
        // MCP servers whose authProvider has no dedicated `auth.providers`
        // entry get the main Dex ID token forwarded instead (single
        // sign-on via muster's trusted-audiences validation), so no
        // separate PKCE login is needed.
        const mainAuthApi = getOptionalMainAuthApi(gsAuthProvidersApi);
        return new MCPAuthProviders(authProviders, mainAuthApi);
      },
    }),
});
