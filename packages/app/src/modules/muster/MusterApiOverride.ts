import { ApiBlueprint } from '@backstage/frontend-plugin-api';
import {
  musterAuthProvidersApiRef,
  MusterAuthProviders,
} from '@giantswarm/backstage-plugin-muster';
import { gsAuthProvidersApiRef } from '@giantswarm/backstage-plugin-gs';

export const MusterApiOverride = ApiBlueprint.make({
  name: 'auth-providers',
  params: defineParams =>
    defineParams({
      api: musterAuthProvidersApiRef,
      deps: { gsAuthProvidersApi: gsAuthProvidersApiRef },
      factory: ({ gsAuthProvidersApi }) => {
        const authProviders = gsAuthProvidersApi.getMCPAuthApis();
        return new MusterAuthProviders(authProviders);
      },
    }),
});
