import {
  createExternalRouteRef,
  createRouteRef,
  createSubRouteRef,
} from '@backstage/core-plugin-api';

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

export const deploymentDetailsRouteRef = createSubRouteRef({
  id: 'gs-deployments/deployment-details',
  path: '/:installationName/:kind/:namespace/:name/*',
  parent: deploymentsRouteRef,
});

export const entityDeploymentsRouteRef = createRouteRef({
  id: 'gs-entity-deployments',
});

export const entityKratixResourcesRouteRef = createRouteRef({
  id: 'gs-entity-kratix-resources',
});

export const fluxOverviewExternalRouteRef = createExternalRouteRef({
  id: 'flux-overview',
});

export const fluxResourcesExternalRouteRef = createExternalRouteRef({
  id: 'flux-resources',
});

export const appDeploymentTemplateRouteRef = createExternalRouteRef({
  id: 'app-deployment-template',
  optional: true,
  params: ['namespace', 'templateName'],
  defaultTarget: 'scaffolder.selectedTemplate',
});
