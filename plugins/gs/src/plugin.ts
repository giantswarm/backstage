import {
  createPlugin,
  createRoutableExtension,
} from '@backstage/core-plugin-api';

import {
  clustersRouteRef,
  entityDeploymentsRouteRef,
  rootRouteRef,
} from './routes';
import {
  createScaffolderFieldExtension,
  createScaffolderLayout,
} from '@backstage/plugin-scaffolder-react';

import {
  ClusterPicker,
  ClusterPickerSchema,
  clusterPickerValidation,
} from './components/scaffolder/ClusterPicker';
import {
  DeploymentDetailsPicker,
  DeploymentDetailsPickerSchema,
} from './components/scaffolder/DeploymentDetailsPicker';
import { Integrations } from './components/scaffolder/Integrations';
import {
  TemplateStringInput,
  TemplateStringInputSchema,
} from './components/scaffolder/TemplateStringInput';

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

export const GSDeploymentDetailsPickerFieldExtension = gsPlugin.provide(
  createScaffolderFieldExtension({
    name: 'GSDeploymentDetailsPicker',
    component: DeploymentDetailsPicker,
    schema: DeploymentDetailsPickerSchema,
  }),
);

export const GSTemplateStringInputFieldExtension = gsPlugin.provide(
  createScaffolderFieldExtension({
    name: 'GSTemplateStringInput',
    component: TemplateStringInput,
    schema: TemplateStringInputSchema,
  }),
);

export const GSIntegrationsLayout = gsPlugin.provide(
  createScaffolderLayout({
    name: 'GSIntegrations',
    component: Integrations,
  }),
);
