import { createRouteRef, createSubRouteRef } from '@backstage/core-plugin-api';

export const rootRouteRef = createRouteRef({
  id: 'flux',
});

export const resourcesSubRouteRef = createSubRouteRef({
  id: 'flux-resources',
  path: '/list',
  parent: rootRouteRef,
});
