import { ApiBlueprint } from '@backstage/frontend-plugin-api';
import {
  repositoriesAuthApiRef,
  RepositoriesMainAuth,
} from '@giantswarm/backstage-plugin-repositories';
import { gsAuthProvidersApiRef } from '@giantswarm/backstage-plugin-gs';
import { getOptionalMainAuthApi } from '../auth/getOptionalMainAuthApi';

/**
 * The repositories backend calls giantswarm-repo-manager through muster as
 * the signed-in person, so the frontend forwards the same credential the
 * muster plugin does: the main login provider's (Dex) ID token.
 */
export const RepositoriesApiOverride = ApiBlueprint.make({
  name: 'auth',
  params: defineParams =>
    defineParams({
      api: repositoriesAuthApiRef,
      deps: { gsAuthProvidersApi: gsAuthProvidersApiRef },
      factory: ({ gsAuthProvidersApi }) =>
        new RepositoriesMainAuth(getOptionalMainAuthApi(gsAuthProvidersApi)),
    }),
});
