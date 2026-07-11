import { ApiBlueprint } from '@backstage/frontend-plugin-api';
import { configApiRef } from '@backstage/core-plugin-api';
import {
  mcpAuthProvidersApiRef,
  MCPAuthProviders,
} from '@giantswarm/backstage-plugin-ai-chat';
import { gsAuthProvidersApiRef } from '@giantswarm/backstage-plugin-gs';
import { getOptionalMainAuthApi } from '../auth/getOptionalMainAuthApi';
import { createMusterTokenProvider } from '../auth/createMusterTokenProvider';

export const AiChatApiOverride = ApiBlueprint.make({
  name: 'mcp-auth-providers',
  params: defineParams =>
    defineParams({
      api: mcpAuthProvidersApiRef,
      deps: {
        gsAuthProvidersApi: gsAuthProvidersApiRef,
        configApi: configApiRef,
      },
      factory: ({ gsAuthProvidersApi, configApi }) => {
        const authProviders = gsAuthProvidersApi.getMCPAuthApis();
        // MCP servers whose authProvider has no dedicated `auth.providers`
        // entry get the main Dex ID token forwarded instead (single
        // sign-on via muster's trusted-audiences validation), so no
        // separate PKCE login is needed. When gs.musterToken.tokenUrl is set,
        // the ID token is first exchanged for a muster-signed token so
        // muster's outbound exchange accepts it.
        const mainAuthApi = getOptionalMainAuthApi(gsAuthProvidersApi);
        const musterTokenProvider = createMusterTokenProvider(
          gsAuthProvidersApi,
          configApi,
        );
        return new MCPAuthProviders(
          authProviders,
          mainAuthApi,
          musterTokenProvider,
        );
      },
    }),
});
