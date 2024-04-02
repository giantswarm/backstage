import {
  createPlugin,
  createRoutableExtension,
} from '@backstage/core-plugin-api';

import {
  clustersRouteRef,
  entityDeploymentsRouteRef,
  rootRouteRef,
} from './routes';

export const gsPlugin = createPlugin({
  id: 'gs',
  routes: {
    root: rootRouteRef,
    clustersPage: clustersRouteRef,
    entityContent: entityDeploymentsRouteRef,
  },
});

export const GSClustersPage = gsPlugin.provide(
  createRoutableExtension({
    name: 'GSClustersPage',
    component: () =>
      import('./components/clusters/ClustersPage').then(m => m.ClustersPage),
    mountPoint: clustersRouteRef,
  }),
);

export const EntityGSDeploymentsContent = gsPlugin.provide(
  createRoutableExtension({
    name: 'EntityGSDeploymentsContent',
    component: () =>
      import('./components/deployments/EntityDeploymentsContent').then(
        m => m.EntityDeploymentsContent,
      ),
    mountPoint: entityDeploymentsRouteRef,
  }),
);
