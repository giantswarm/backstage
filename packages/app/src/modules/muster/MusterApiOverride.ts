import { ApiBlueprint } from '@backstage/frontend-plugin-api';
import {
  musterAuthProvidersApiRef,
  MusterAuthProviders,
} from '@giantswarm/backstage-plugin-muster';
import { gsAuthProvidersApiRef } from '@giantswarm/backstage-plugin-gs';
import { getOptionalMainAuthApi } from '../auth/getOptionalMainAuthApi';

export const MusterApiOverride = ApiBlueprint.make({
  name: 'auth-providers',
  params: defineParams =>
    defineParams({
      api: musterAuthProvidersApiRef,
      deps: { gsAuthProvidersApi: gsAuthProvidersApiRef },
      factory: ({ gsAuthProvidersApi }) => {
        const authProviders = gsAuthProvidersApi.getMCPAuthApis();
        // Same single sign-on fallback as the ai-chat MCP auth providers:
        // without a dedicated provider entry, the main Dex ID token is
        // forwarded as the muster bearer token.
        const mainAuthApi = getOptionalMainAuthApi(gsAuthProvidersApi);
        return new MusterAuthProviders(authProviders, mainAuthApi);
      },
    }),
});
