import {
  createExternalRouteRef,
  createRouteRef,
} from '@backstage/frontend-plugin-api';

export const rootRouteRef = createRouteRef();

// External route refs for portal URL generation tool.
// These are bound to actual plugin routes in App.tsx.

export const clusterDetailExternalRouteRef = createExternalRouteRef({
  params: ['installationName', 'namespace', 'name'],
});

export const deploymentDetailExternalRouteRef = createExternalRouteRef({
  params: ['installationName', 'kind', 'namespace', 'name'],
});

export const catalogEntityExternalRouteRef = createExternalRouteRef({
  params: ['namespace', 'kind', 'name'],
});

export const techdocsEntityExternalRouteRef = createExternalRouteRef({
  params: ['namespace', 'kind', 'name'],
});

export const fluxExternalRouteRef = createExternalRouteRef();
