import { createRouteRef } from '@backstage/core-plugin-api';

export const rootRouteRef = createRouteRef({
  id: 'gs',
});

export const entityDeploymentsRouteRef = createRouteRef({
  id: 'gs-deployments',
});
