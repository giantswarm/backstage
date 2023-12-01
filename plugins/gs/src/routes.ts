import { createRouteRef } from '@backstage/core-plugin-api';

export const rootRouteRef = createRouteRef({
  id: 'gs',
});

export const entityDeployedToRouteRef = createRouteRef({
  id: 'gs-deployed-to',
});
