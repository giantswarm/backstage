import { ApiBlueprint } from '@backstage/frontend-plugin-api';
import {
  plansAuthApiRef,
  PlansMainAuth,
} from '@giantswarm/backstage-plugin-plans';
import { gsAuthProvidersApiRef } from '@giantswarm/backstage-plugin-gs';
import { getOptionalMainAuthApi } from '../auth/getOptionalMainAuthApi';

/**
 * The plans backend calls GitHub through muster as the signed-in person, so
 * the plans frontend forwards the same credential the muster plugin does:
 * the main login provider's (Dex) ID token.
 */
export const PlansApiOverride = ApiBlueprint.make({
  name: 'auth',
  params: defineParams =>
    defineParams({
      api: plansAuthApiRef,
      deps: { gsAuthProvidersApi: gsAuthProvidersApiRef },
      factory: ({ gsAuthProvidersApi }) =>
        new PlansMainAuth(getOptionalMainAuthApi(gsAuthProvidersApi)),
    }),
});
