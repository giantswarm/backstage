import { ApiBlueprint } from '@backstage/frontend-plugin-api';
import {
  platformCapabilitiesAuthApiRef,
  PlatformCapabilitiesMainAuth,
} from '@giantswarm/backstage-plugin-platform-capabilities';
import { gsAuthProvidersApiRef } from '@giantswarm/backstage-plugin-gs';
import { getOptionalMainAuthApi } from '../auth/getOptionalMainAuthApi';

/**
 * The platform-capabilities backend calls giantswarm-platform-manager through
 * muster as the signed-in person, so the frontend forwards the same
 * credential the muster plugin does: the main login provider's (Dex) ID token.
 */
export const PlatformCapabilitiesApiOverride = ApiBlueprint.make({
  name: 'auth',
  params: defineParams =>
    defineParams({
      api: platformCapabilitiesAuthApiRef,
      deps: { gsAuthProvidersApi: gsAuthProvidersApiRef },
      factory: ({ gsAuthProvidersApi }) =>
        new PlatformCapabilitiesMainAuth(
          getOptionalMainAuthApi(gsAuthProvidersApi),
        ),
    }),
});
