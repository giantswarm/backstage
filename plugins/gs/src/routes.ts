import {
  createExternalRouteRef,
  createRouteRef,
  createSubRouteRef,
} from '@backstage/frontend-plugin-api';

export const rootRouteRef = createRouteRef();

export const clustersRouteRef = createRouteRef();

export const clusterDetailsRouteRef = createSubRouteRef({
  path: '/:installationName/:namespace/:name/*',
  parent: clustersRouteRef,
});

export const installationsRouteRef = createRouteRef();

export const deploymentsRouteRef = createRouteRef();

export const deploymentDetailsRouteRef = createSubRouteRef({
  path: '/:installationName/:kind/:namespace/:name/*',
  parent: deploymentsRouteRef,
});

export const entityDeploymentsRouteRef = createRouteRef();

export const entityKratixResourcesRouteRef = createRouteRef();

export const fluxOverviewExternalRouteRef = createExternalRouteRef();

export const fluxResourcesExternalRouteRef = createExternalRouteRef();

export const appDeploymentTemplateRouteRef = createExternalRouteRef({
  params: ['namespace', 'templateName'],
  defaultTarget: 'scaffolder.selectedTemplate',
});
