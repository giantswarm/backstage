import { ApiBlueprint } from '@backstage/frontend-plugin-api';
import {
  roadmapAuthApiRef,
  RoadmapMainAuth,
} from '@giantswarm/backstage-plugin-roadmap';
import { gsAuthProvidersApiRef } from '@giantswarm/backstage-plugin-gs';
import { getOptionalMainAuthApi } from '../auth/getOptionalMainAuthApi';

/**
 * The roadmap backend runs pro's board tools through muster as the signed-in
 * person, so the roadmap frontend forwards the same credential the muster and
 * plans plugins do: the main login provider's (Dex) ID token.
 */
export const RoadmapApiOverride = ApiBlueprint.make({
  name: 'auth',
  params: defineParams =>
    defineParams({
      api: roadmapAuthApiRef,
      deps: { gsAuthProvidersApi: gsAuthProvidersApiRef },
      factory: ({ gsAuthProvidersApi }) =>
        new RoadmapMainAuth(getOptionalMainAuthApi(gsAuthProvidersApi)),
    }),
});
