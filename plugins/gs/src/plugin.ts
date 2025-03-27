import {
  configApiRef,
  createApiFactory,
  createPlugin,
  createRoutableExtension,
  discoveryApiRef,
  fetchApiRef,
  oauthRequestApiRef,
} from '@backstage/core-plugin-api';

import {
  clustersRouteRef,
  deploymentsRouteRef,
  entityDeploymentsRouteRef,
  entityKratixResourcesRouteRef,
  installationsRouteRef,
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
import {
  WorkloadClusterDetailsPicker,
  WorkloadClusterDetailsPickerSchema,
} from './components/scaffolder/WorkloadClusterDetailsPicker';
import {
  InstallationPicker,
  InstallationPickerSchema,
} from './components/scaffolder/InstallationPicker';
import {
  SecretStorePicker,
  SecretStorePickerSchema,
} from './components/scaffolder/SecretStorePicker';
import { StepLayout } from './components/scaffolder/StepLayout';
import {
  TemplateStringInput,
  TemplateStringInputSchema,
} from './components/scaffolder/TemplateStringInput';
import {
  gsAuthProvidersApiRef,
  GSAuthProviders,
  gsAuthApiRef,
} from './apis/auth';
import { gsKubernetesApiRef, KubernetesClient } from './apis/kubernetes';
import {
  gsKubernetesAuthProvidersApiRef,
  KubernetesAuthProviders,
} from './apis/kubernetes-auth-providers';

export const gsPlugin = createPlugin({
  id: 'gs',
  apis: [
    createApiFactory({
      api: gsAuthProvidersApiRef,
      deps: {
        configApi: configApiRef,
        discoveryApi: discoveryApiRef,
        oauthRequestApi: oauthRequestApiRef,
      },
      factory: ({ configApi, discoveryApi, oauthRequestApi }) =>
        GSAuthProviders.create({
          configApi,
          discoveryApi,
          oauthRequestApi,
        }),
    }),
    createApiFactory({
      api: gsAuthApiRef,
      deps: {
        gsAuthProvidersApi: gsAuthProvidersApiRef,
      },
      factory: ({ gsAuthProvidersApi }) => {
        return gsAuthProvidersApi.getMainAuthApi();
      },
    }),
    createApiFactory({
      api: gsKubernetesAuthProvidersApiRef,
      deps: {
        gsAuthProvidersApi: gsAuthProvidersApiRef,
      },
      factory: ({ gsAuthProvidersApi }) => {
        const oidcProviders = {
          ...gsAuthProvidersApi.getAuthApis(),
        };

        return new KubernetesAuthProviders({
          oidcProviders,
        });
      },
    }),
    createApiFactory({
      api: gsKubernetesApiRef,
      deps: {
        configApi: configApiRef,
        fetchApi: fetchApiRef,
        kubernetesAuthProvidersApi: gsKubernetesAuthProvidersApiRef,
      },
      factory: ({ configApi, fetchApi, kubernetesAuthProvidersApi }) =>
        new KubernetesClient({
          configApi,
          fetchApi,
          kubernetesAuthProvidersApi,
        }),
    }),
  ],
  routes: {
    root: rootRouteRef,
    clustersPage: clustersRouteRef,
    deploymentsPage: deploymentsRouteRef,
    entityContent: entityDeploymentsRouteRef,
    entityKratixResourcesContent: entityKratixResourcesRouteRef,
  },
  featureFlags: [
    {
      name: 'experimental-data-fetching',
    },
  ],
});

export const GSClustersPage = gsPlugin.provide(
  createRoutableExtension({
    name: 'GSClustersPage',
    component: () => import('./components/clusters/Router').then(m => m.Router),
    mountPoint: clustersRouteRef,
  }),
);

export const GSDeploymentsPage = gsPlugin.provide(
  createRoutableExtension({
    name: 'GSDeploymentsPage',
    component: () =>
      import('./components/deployments/Router').then(m => m.Router),
    mountPoint: deploymentsRouteRef,
  }),
);

export const GSInstallationsPage = gsPlugin.provide(
  createRoutableExtension({
    name: 'GSInstallationsPage',
    component: () =>
      import('./components/catalog/InstallationsPage').then(
        m => m.InstallationsPage,
      ),
    mountPoint: installationsRouteRef,
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

export const EntityGSKratixResourcesContent = gsPlugin.provide(
  createRoutableExtension({
    name: 'EntityGSKratixResourcesContent',
    component: () =>
      import('./components/catalog/EntityKratixResourcesContent').then(
        m => m.EntityKratixResourcesContent,
      ),
    mountPoint: entityKratixResourcesRouteRef,
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

export const GSWorkloadClusterDetailsPickerFieldExtension = gsPlugin.provide(
  createScaffolderFieldExtension({
    name: 'GSWorkloadClusterDetailsPicker',
    component: WorkloadClusterDetailsPicker,
    schema: WorkloadClusterDetailsPickerSchema,
  }),
);

export const GSInstallationPickerFieldExtension = gsPlugin.provide(
  createScaffolderFieldExtension({
    name: 'GSInstallationPicker',
    component: InstallationPicker,
    schema: InstallationPickerSchema,
  }),
);

export const GSSecretStorePickerFieldExtension = gsPlugin.provide(
  createScaffolderFieldExtension({
    name: 'GSSecretStorePicker',
    component: SecretStorePicker,
    schema: SecretStorePickerSchema,
  }),
);

export const GSTemplateStringInputFieldExtension = gsPlugin.provide(
  createScaffolderFieldExtension({
    name: 'GSTemplateStringInput',
    component: TemplateStringInput,
    schema: TemplateStringInputSchema,
  }),
);

export const GSStepLayout = gsPlugin.provide(
  createScaffolderLayout({
    name: 'GSStepLayout',
    component: StepLayout,
  }),
);
