import { createRouteRef, createSubRouteRef } from '@backstage/core-plugin-api';

export const rootRouteRef = createRouteRef({
  id: 'flux',
});

export const resourcesRouteRef = createRouteRef({
  id: 'flux-resources',
});

export const detailsRouteRef = createSubRouteRef({
  id: 'flux/details',
  path: '/:cluster/:kind/:namespace/:name',
  parent: rootRouteRef,
});
