import { ApiBlueprint } from '@backstage/frontend-plugin-api';
import { configApiRef } from '@backstage/core-plugin-api';
import {
  musterAuthProvidersApiRef,
  MusterAuthProviders,
} from '@giantswarm/backstage-plugin-muster';
import { gsAuthProvidersApiRef } from '@giantswarm/backstage-plugin-gs';
import { getOptionalMainAuthApi } from '../auth/getOptionalMainAuthApi';
import { createMusterTokenProvider } from '../auth/createMusterTokenProvider';

export const MusterApiOverride = ApiBlueprint.make({
  name: 'auth-providers',
  params: defineParams =>
    defineParams({
      api: musterAuthProvidersApiRef,
      deps: {
        gsAuthProvidersApi: gsAuthProvidersApiRef,
        configApi: configApiRef,
      },
      factory: ({ gsAuthProvidersApi, configApi }) => {
        const authProviders = gsAuthProvidersApi.getMCPAuthApis();
        // Same single sign-on fallback as the ai-chat MCP auth providers:
        // without a dedicated provider entry, the main Dex ID token is
        // forwarded as the muster bearer token, or exchanged for a
        // muster-signed token first when gs.musterToken.tokenUrl is set.
        const mainAuthApi = getOptionalMainAuthApi(gsAuthProvidersApi);
        const musterTokenProvider = createMusterTokenProvider(
          gsAuthProvidersApi,
          configApi,
        );
        return new MusterAuthProviders(
          authProviders,
          mainAuthApi,
          musterTokenProvider,
        );
      },
    }),
});
