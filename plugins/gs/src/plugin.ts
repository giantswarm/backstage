import {
  configApiRef,
  createApiFactory,
  createPlugin,
  createRoutableExtension,
  discoveryApiRef,
  oauthRequestApiRef,
} from '@backstage/core-plugin-api';

import {
  clustersRouteRef,
  deploymentsRouteRef,
  entityDeploymentsRouteRef,
  entityKratixResourcesRouteRef,
  fluxOverviewExternalRouteRef,
  fluxResourcesExternalRouteRef,
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
  ProviderConfigPicker,
  ProviderConfigPickerSchema,
} from './components/scaffolder/ProviderConfigPicker';
import { OIDCToken, OIDCTokenSchema } from './components/scaffolder/OIDCToken';
import {
  InstallationPicker,
  InstallationPickerSchema,
  installationPickerValidation,
} from './components/scaffolder/InstallationPicker';
import {
  ReleasePicker,
  ReleasePickerSchema,
} from './components/scaffolder/ReleasePicker';
import {
  OrganizationPicker,
  OrganizationPickerSchema,
} from './components/scaffolder/OrganizationPicker';
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
import { DiscoveryApiClient } from './apis/discovery/DiscoveryApiClient';

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
          discoveryApi: discoveryApi as DiscoveryApiClient,
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
  ],
  routes: {
    root: rootRouteRef,
    clustersPage: clustersRouteRef,
    deploymentsPage: deploymentsRouteRef,
    entityContent: entityDeploymentsRouteRef,
    entityKratixResourcesContent: entityKratixResourcesRouteRef,
  },
  externalRoutes: {
    fluxOverview: fluxOverviewExternalRouteRef,
    fluxResources: fluxResourcesExternalRouteRef,
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

export const GSProviderConfigPickerFieldExtension = gsPlugin.provide(
  createScaffolderFieldExtension({
    name: 'GSProviderConfigPicker',
    component: ProviderConfigPicker,
    schema: ProviderConfigPickerSchema,
  }),
);

export const GSOIDCTokenFieldExtension = gsPlugin.provide(
  createScaffolderFieldExtension({
    name: 'GSOIDCToken',
    component: OIDCToken,
    schema: OIDCTokenSchema,
  }),
);

export const GSInstallationPickerFieldExtension = gsPlugin.provide(
  createScaffolderFieldExtension({
    name: 'GSInstallationPicker',
    component: InstallationPicker,
    schema: InstallationPickerSchema,
    validation: installationPickerValidation,
  }),
);

export const GSReleasePickerFieldExtension = gsPlugin.provide(
  createScaffolderFieldExtension({
    name: 'GSReleasePicker',
    component: ReleasePicker,
    schema: ReleasePickerSchema,
  }),
);

export const GSOrganizationPickerFieldExtension = gsPlugin.provide(
  createScaffolderFieldExtension({
    name: 'GSOrganizationPicker',
    component: OrganizationPicker,
    schema: OrganizationPickerSchema,
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
