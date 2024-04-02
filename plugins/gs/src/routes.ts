import { createRouteRef } from '@backstage/core-plugin-api';

export const rootRouteRef = createRouteRef({
  id: 'gs',
});

export const clustersRouteRef = createRouteRef({
  id: 'gs-clusters',
});

export const entityDeploymentsRouteRef = createRouteRef({
  id: 'gs-deployments',
});
