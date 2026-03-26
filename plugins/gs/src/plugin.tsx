import {
  createFrontendPlugin,
  PageBlueprint,
  NavItemBlueprint,
  ApiBlueprint,
} from '@backstage/frontend-plugin-api';
import {
  EntityCardBlueprint,
  EntityContentBlueprint,
  EntityContentLayoutBlueprint,
} from '@backstage/plugin-catalog-react/alpha';
import {
  FormFieldBlueprint,
  createFormField,
} from '@backstage/plugin-scaffolder-react/alpha';
import {
  configApiRef,
  discoveryApiRef,
  fetchApiRef,
  oauthRequestApiRef,
} from '@backstage/core-plugin-api';
import StorageIcon from '@material-ui/icons/Storage';
import CloudUploadIcon from '@material-ui/icons/CloudUpload';
import ApartmentIcon from '@material-ui/icons/Apartment';

import {
  appDeploymentTemplateRouteRef,
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
  isEntityHelmChartTagged,
  isEntityInstallationResource,
  isEntityKratixResource,
} from './components/utils/entity';
import {
  gsAuthProvidersApiRef,
  GSAuthProviders,
  gsAuthApiRef,
} from './apis/auth';
import { DiscoveryApiClient } from './apis/discovery/DiscoveryApiClient';
import {
  ContainerRegistryClient,
  containerRegistryApiRef,
} from './apis/containerRegistry';
import { MimirClient, mimirApiRef } from './apis/mimir';

// Pages
const clustersPage = PageBlueprint.make({
  name: 'clusters',
  disabled: true,
  params: {
    noHeader: true,
    path: '/clusters',
    routeRef: clustersRouteRef,
    loader: async () => {
      const { Router } = await import('./components/clusters/Router');
      return <Router />;
    },
  },
});

const deploymentsPage = PageBlueprint.make({
  name: 'deployments',
  disabled: true,
  params: {
    noHeader: true,
    path: '/deployments',
    routeRef: deploymentsRouteRef,
    loader: async () => {
      const { Router } = await import('./components/deployments/Router');
      return <Router />;
    },
  },
});

const installationsPage = PageBlueprint.make({
  name: 'installations',
  disabled: true,
  params: {
    noHeader: true,
    path: '/installations',
    routeRef: installationsRouteRef,
    loader: async () => {
      const { InstallationsPage } =
        await import('./components/catalog/InstallationsPage');
      return <InstallationsPage />;
    },
  },
});

// Nav items (forward-compat; not consumed by legacy sidebar)
const clustersNavItem = NavItemBlueprint.make({
  name: 'clusters',
  disabled: true,
  params: {
    title: 'Clusters',
    icon: StorageIcon,
    routeRef: clustersRouteRef,
  },
});

const deploymentsNavItem = NavItemBlueprint.make({
  name: 'deployments',
  disabled: true,
  params: {
    title: 'Deployments',
    icon: CloudUploadIcon,
    routeRef: deploymentsRouteRef,
  },
});

const installationsNavItem = NavItemBlueprint.make({
  name: 'installations',
  disabled: true,
  params: {
    title: 'Installations',
    icon: ApartmentIcon,
    routeRef: installationsRouteRef,
  },
});

// APIs
const gsAuthProvidersApi = ApiBlueprint.make({
  name: 'auth-providers',
  params: defineParams =>
    defineParams({
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
});

const gsAuthApi = ApiBlueprint.make({
  name: 'auth',
  params: defineParams =>
    defineParams({
      api: gsAuthApiRef,
      deps: {
        gsAuthProvidersApi: gsAuthProvidersApiRef,
      },
      factory: ({ gsAuthProvidersApi: authProviders }) => {
        return authProviders.getMainAuthApi();
      },
    }),
});

const containerRegistryApi = ApiBlueprint.make({
  name: 'container-registry',
  params: defineParams =>
    defineParams({
      api: containerRegistryApiRef,
      deps: {
        discoveryApi: discoveryApiRef,
        fetchApi: fetchApiRef,
      },
      factory: ({ discoveryApi, fetchApi }) =>
        new ContainerRegistryClient({ discoveryApi, fetchApi }),
    }),
});

const mimirApi = ApiBlueprint.make({
  name: 'mimir',
  params: defineParams =>
    defineParams({
      api: mimirApiRef,
      deps: {
        discoveryApi: discoveryApiRef,
        fetchApi: fetchApiRef,
      },
      factory: ({ discoveryApi, fetchApi }) =>
        new MimirClient({ discoveryApi, fetchApi }),
    }),
});

// Entity cards for the catalog entity overview page
const appDeploymentEntityCard = EntityCardBlueprint.make({
  name: 'app-deployment',
  params: {
    type: 'info',
    filter: entity =>
      (entity.metadata.tags ?? []).includes('helmchart-deployable'),
    loader: async () => {
      const { EntityAppDeploymentCard } =
        await import('./components/catalog/EntityAppDeploymentCard');
      return <EntityAppDeploymentCard />;
    },
  },
});

const installationDetailsEntityCard = EntityCardBlueprint.make({
  name: 'installation-details',
  params: {
    type: 'content',
    filter: entity => isEntityInstallationResource(entity),
    loader: async () => {
      const { EntityInstallationDetailsCard } =
        await import('./components/catalog/EntityInstallationDetailsCard');
      return <EntityInstallationDetailsCard />;
    },
  },
});

const kratixStatusEntityCard = EntityCardBlueprint.make({
  name: 'kratix-status',
  params: {
    type: 'info',
    filter: entity => isEntityKratixResource(entity),
    loader: async () => {
      const { EntityKratixStatusCard } =
        await import('./components/catalog/EntityKratixStatusCard');
      return <EntityKratixStatusCard />;
    },
  },
});

const versionHistoryEntityCard = EntityCardBlueprint.make({
  name: 'version-history',
  params: {
    type: 'content',
    filter: entity => isEntityHelmChartTagged(entity),
    loader: async () => {
      const { EntityVersionHistoryCard } =
        await import('./components/catalog/EntityVersionHistoryCard');
      return <EntityVersionHistoryCard />;
    },
  },
});

const readmeEntityCard = EntityCardBlueprint.make({
  name: 'readme',
  params: {
    type: 'content',
    filter: entity => isEntityHelmChartTagged(entity),
    loader: async () => {
      const { EntityReadmeCard } =
        await import('./components/catalog/EntityReadmeCard');
      return <EntityReadmeCard />;
    },
  },
});

// Entity content tabs for the catalog entity page
const deploymentsEntityContent = EntityContentBlueprint.make({
  name: 'deployments',
  params: {
    path: '/deployments',
    title: 'Deployments',
    routeRef: entityDeploymentsRouteRef,
    filter: entity => isEntityHelmChartTagged(entity),
    loader: async () => {
      const { EntityDeploymentsContent } =
        await import('./components/deployments/EntityDeploymentsContent');
      return <EntityDeploymentsContent />;
    },
  },
});

const versionHistoryEntityContent = EntityContentBlueprint.make({
  name: 'version-history',
  params: {
    path: '/version-history',
    title: 'Version History',
    filter: entity => isEntityHelmChartTagged(entity),
    loader: async () => {
      const { EntityVersionHistoryContent } =
        await import('./components/catalog/EntityVersionHistoryContent');
      return <EntityVersionHistoryContent />;
    },
  },
});

const kratixResourcesEntityContent = EntityContentBlueprint.make({
  name: 'kratix-resources',
  params: {
    path: '/kratix-resources',
    title: 'Kratix Resources',
    group: 'operation',
    routeRef: entityKratixResourcesRouteRef,
    filter: entity => isEntityKratixResource(entity),
    loader: async () => {
      const { EntityKratixResourcesContent } =
        await import('./components/catalog/EntityKratixResourcesContent');
      return <EntityKratixResourcesContent />;
    },
  },
});

// Content layout for helm chart entities — wraps cards in EntityChartProvider
const helmChartContentLayout = EntityContentLayoutBlueprint.make({
  name: 'helm-chart',
  params: {
    filter: entity => isEntityHelmChartTagged(entity),
    loader: async () => {
      const { HelmChartContentLayout } =
        await import('./components/catalog/HelmChartContentLayout');
      return HelmChartContentLayout;
    },
  },
});

// Scaffolder form field extensions
const chartPickerFormField = FormFieldBlueprint.make({
  name: 'chart-picker',
  params: {
    field: () =>
      import('./components/scaffolder/ChartPicker').then(m =>
        createFormField({
          name: 'GSChartPicker',
          component: m.ChartPicker,
          schema: m.ChartPickerFieldSchema,
        }),
      ),
  },
});

const chartTagPickerFormField = FormFieldBlueprint.make({
  name: 'chart-tag-picker',
  params: {
    field: () =>
      import('./components/scaffolder/ChartTagPicker').then(m =>
        createFormField({
          name: 'GSChartTagPicker',
          component: m.ChartTagPicker,
          schema: m.ChartTagPickerFieldSchema,
        }),
      ),
  },
});

const clusterPickerFormField = FormFieldBlueprint.make({
  name: 'cluster-picker',
  params: {
    field: () =>
      import('./components/scaffolder/ClusterPicker').then(m =>
        createFormField({
          name: 'GSClusterPicker',
          component: m.ClusterPicker,
          schema: m.ClusterPickerFieldSchema,
          validation: m.clusterPickerValidation,
        }),
      ),
  },
});

const providerConfigPickerFormField = FormFieldBlueprint.make({
  name: 'provider-config-picker',
  params: {
    field: () =>
      import('./components/scaffolder/ProviderConfigPicker').then(m =>
        createFormField({
          name: 'GSProviderConfigPicker',
          component: m.ProviderConfigPicker,
          schema: m.ProviderConfigPickerFieldSchema,
        }),
      ),
  },
});

const oidcTokenFormField = FormFieldBlueprint.make({
  name: 'oidc-token',
  params: {
    field: () =>
      import('./components/scaffolder/OIDCToken').then(m =>
        createFormField({
          name: 'GSOIDCToken',
          component: m.OIDCToken,
          schema: m.OIDCTokenFieldSchema,
        }),
      ),
  },
});

const installationPickerFormField = FormFieldBlueprint.make({
  name: 'installation-picker',
  params: {
    field: () =>
      import('./components/scaffolder/InstallationPicker').then(m =>
        createFormField({
          name: 'GSInstallationPicker',
          component: m.InstallationPicker,
          schema: m.InstallationPickerFieldSchema,
          validation: m.installationPickerValidation,
        }),
      ),
  },
});

const releasePickerFormField = FormFieldBlueprint.make({
  name: 'release-picker',
  params: {
    field: () =>
      import('./components/scaffolder/ReleasePicker').then(m =>
        createFormField({
          name: 'GSReleasePicker',
          component: m.ReleasePicker,
          schema: m.ReleasePickerFieldSchema,
        }),
      ),
  },
});

const organizationPickerFormField = FormFieldBlueprint.make({
  name: 'organization-picker',
  params: {
    field: () =>
      import('./components/scaffolder/OrganizationPicker').then(m =>
        createFormField({
          name: 'GSOrganizationPicker',
          component: m.OrganizationPicker,
          schema: m.OrganizationPickerFieldSchema,
        }),
      ),
  },
});

const secretStorePickerFormField = FormFieldBlueprint.make({
  name: 'secret-store-picker',
  params: {
    field: () =>
      import('./components/scaffolder/SecretStorePicker').then(m =>
        createFormField({
          name: 'GSSecretStorePicker',
          component: m.SecretStorePicker,
          schema: m.SecretStorePickerFieldSchema,
        }),
      ),
  },
});

const templateStringInputFormField = FormFieldBlueprint.make({
  name: 'template-string-input',
  params: {
    field: () =>
      import('./components/scaffolder/TemplateStringInput').then(m =>
        createFormField({
          name: 'GSTemplateStringInput',
          component: m.TemplateStringInput,
          schema: m.TemplateStringInputFieldSchema,
        }),
      ),
  },
});

const entityPickerFormField = FormFieldBlueprint.make({
  name: 'entity-picker',
  params: {
    field: () =>
      import('./components/scaffolder/EntityPicker').then(m =>
        createFormField({
          name: 'GSEntityPicker',
          component: m.EntityPicker,
          schema: m.EntityPickerFieldSchema,
        }),
      ),
  },
});

const deploymentPickerFormField = FormFieldBlueprint.make({
  name: 'deployment-picker',
  params: {
    field: () =>
      import('./components/scaffolder/DeploymentPicker').then(m =>
        createFormField({
          name: 'GSDeploymentPicker',
          component: m.DeploymentPicker,
          schema: m.DeploymentPickerFieldSchema,
        }),
      ),
  },
});

const yamlValuesEditorFormField = FormFieldBlueprint.make({
  name: 'yaml-values-editor',
  params: {
    field: () =>
      import('./components/scaffolder/YamlValuesEditor').then(m =>
        createFormField({
          name: 'GSYamlValuesEditor',
          component: m.YamlValuesEditor,
          schema: m.YamlValuesEditorFieldSchema,
          validation: m.yamlValuesEditorValidation,
        }),
      ),
  },
});

const secretYamlValuesEditorFormField = FormFieldBlueprint.make({
  name: 'secret-yaml-values-editor',
  params: {
    field: () =>
      import('./components/scaffolder/SecretYamlValuesEditor').then(m =>
        createFormField({
          name: 'GSSecretYamlValuesEditor',
          component: m.SecretYamlValuesEditor,
          schema: m.SecretYamlValuesEditorFieldSchema,
          validation: m.secretYamlValuesEditorValidation,
        }),
      ),
  },
});

const yamlValuesValidationFormField = FormFieldBlueprint.make({
  name: 'yaml-values-validation',
  params: {
    field: () =>
      import('./components/scaffolder/YamlValuesValidation').then(m =>
        createFormField({
          name: 'GSYamlValuesValidation',
          component: m.YamlValuesValidation,
          schema: m.YamlValuesValidationFieldSchema,
        }),
      ),
  },
});

export const gsPlugin = createFrontendPlugin({
  pluginId: 'gs',
  extensions: [
    clustersPage,
    deploymentsPage,
    installationsPage,
    clustersNavItem,
    deploymentsNavItem,
    installationsNavItem,
    gsAuthProvidersApi,
    gsAuthApi,
    containerRegistryApi,
    mimirApi,
    // Entity cards
    appDeploymentEntityCard,
    installationDetailsEntityCard,
    kratixStatusEntityCard,
    readmeEntityCard,
    versionHistoryEntityCard,
    // Entity content tabs
    deploymentsEntityContent,
    versionHistoryEntityContent,
    kratixResourcesEntityContent,
    // Entity content layout
    helmChartContentLayout,
    // Scaffolder form fields
    chartPickerFormField,
    chartTagPickerFormField,
    clusterPickerFormField,
    providerConfigPickerFormField,
    oidcTokenFormField,
    installationPickerFormField,
    releasePickerFormField,
    organizationPickerFormField,
    secretStorePickerFormField,
    templateStringInputFormField,
    entityPickerFormField,
    deploymentPickerFormField,
    yamlValuesEditorFormField,
    secretYamlValuesEditorFormField,
    yamlValuesValidationFormField,
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
    appDeploymentTemplate: appDeploymentTemplateRouteRef,
  },
});
