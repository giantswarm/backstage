import { ApiBlueprint } from '@backstage/frontend-plugin-api';
import {
  catalogApiRef,
  entityPresentationApiRef,
} from '@backstage/plugin-catalog-react';
import { DefaultEntityPresentationApi } from '@backstage/plugin-catalog';
import { createGSEntityPresentationRenderer } from '@giantswarm/backstage-plugin-gs';

export const EntityPresentationApi = ApiBlueprint.make({
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
});
