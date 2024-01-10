import { createRouteRef, createSubRouteRef } from '@backstage/core-plugin-api';

export const rootRouteRef = createRouteRef({
  id: 'gs',
});

export const entityDeploymentsRouteRef = createRouteRef({
  id: 'gs-deployments',
});

export const entityDeploymentDetailsRouteRef = createSubRouteRef({
  id: 'gs-deployments/details',
  path: '/:deploymentInstallation/:deploymentNamespace/:deploymentName',
  parent: entityDeploymentsRouteRef,
});
