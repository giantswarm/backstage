/**
 * NFS frontend modules that override upstream plugin API defaults
 * with Giant Swarm custom implementations.
 *
 * In Backstage 1.48+, NFS plugins are auto-discovered and provide their
 * own default API factories. These modules override those defaults where
 * we need custom behavior (e.g. GS-specific scaffolder client, kubernetes
 * client, entity presentation, etc.).
 */
import {
  createFrontendModule,
  ApiBlueprint,
} from '@backstage/frontend-plugin-api';
import {
  catalogApiRef,
  entityPresentationApiRef,
} from '@backstage/plugin-catalog-react';
import { DefaultEntityPresentationApi } from '@backstage/plugin-catalog';
import { createGSEntityPresentationRenderer } from '@giantswarm/backstage-plugin-gs';

export const catalogApiOverrides = createFrontendModule({
  pluginId: 'catalog',
  extensions: [
    ApiBlueprint.make({
      name: 'entity-presentation',
      params: defineParams =>
        defineParams({
          api: entityPresentationApiRef,
          deps: { catalogApi: catalogApiRef },
          factory: ({ catalogApi }) =>
            DefaultEntityPresentationApi.create({
              catalogApi,
              renderer: createGSEntityPresentationRenderer(),
            }),
        }),
    }),
  ],
});
