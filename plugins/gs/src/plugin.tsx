import {
  createFrontendPlugin,
  PageBlueprint,
  NavItemBlueprint,
  ApiBlueprint,
} from '@backstage/frontend-plugin-api';
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
  params: {
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
  params: {
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
  params: {
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
  params: {
    title: 'Clusters',
    icon: StorageIcon,
    routeRef: clustersRouteRef,
  },
});

const deploymentsNavItem = NavItemBlueprint.make({
  name: 'deployments',
  params: {
    title: 'Deployments',
    icon: CloudUploadIcon,
    routeRef: deploymentsRouteRef,
  },
});

const installationsNavItem = NavItemBlueprint.make({
  name: 'installations',
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
