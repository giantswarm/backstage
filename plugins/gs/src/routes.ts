import { createRouteRef, createSubRouteRef } from '@backstage/core-plugin-api';

export const rootRouteRef = createRouteRef({
  id: 'gs',
});

export const clustersRouteRef = createRouteRef({
  id: 'gs-clusters',
});

export const clusterDetailsRouteRef = createSubRouteRef({
  id: 'gs-clusters/cluster-details',
  path: '/:installationName/:namespace/:name/*',
  parent: clustersRouteRef,
});

export const installationsRouteRef = createRouteRef({
  id: 'gs-installations',
});

export const deploymentsRouteRef = createRouteRef({
  id: 'gs-deployments',
});

export const entityDeploymentsRouteRef = createRouteRef({
  id: 'gs-entity-deployments',
});

export const entityKratixResourcesRouteRef = createRouteRef({
  id: 'gs-entity-kratix-resources',
});
