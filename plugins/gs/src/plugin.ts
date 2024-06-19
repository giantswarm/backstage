import {
  createPlugin,
  createRoutableExtension,
} from '@backstage/core-plugin-api';

import { createScaffolderFieldExtension } from '@backstage/plugin-scaffolder-react';

import {
  clustersRouteRef,
  entityDeploymentsRouteRef,
  rootRouteRef,
} from './routes';
import {
  ClusterPicker,
  ClusterPickerSchema,
  clusterPickerValidation,
} from './components/scaffolder/ClusterPicker';

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

export const GSClusterPickerFieldExtension = gsPlugin.provide(
  createScaffolderFieldExtension({
    name: 'GSClusterPicker',
    component: ClusterPicker,
    validation: clusterPickerValidation,
    schema: ClusterPickerSchema,
  }),
);
