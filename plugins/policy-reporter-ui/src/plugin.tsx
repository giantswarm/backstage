import {
  createFrontendPlugin,
  PageBlueprint,
} from '@backstage/frontend-plugin-api';
import StorageIcon from '@material-ui/icons/Storage';

import { 
  rootRouteRef, 
  clusterRouteRef, 
  clusterDashboardRouteRef, 
  namespaceDashboardRouteRef, 
  resourceDashboardRouteRef, 
  customBoardDashboardRouteRef, 
  customBoardNamespaceRouteRef, 
  customBoardResourceRouteRef, 
  policyDashboardRouteRef,
  policyDetailsDashboardRouteRef,
} from './routes';

export const clusterListPage = PageBlueprint.make({
  name: 'cluster-list',
  params: {
    noHeader: true,
    path: '/policy-reporter-ui/clusters',
    routeRef: clusterRouteRef,
    title: 'Policy Reporter',
    icon: <StorageIcon />,
    loader: () =>
      import('./components/ClusterListPage').then(m => (
        <m.ClusterListPage />
      )),
  },
});

export const clusterDashboardPage = PageBlueprint.make({
  name: 'cluster-dashboard',
  params: {
    noHeader: true,
    path: '/policy-reporter-ui/clusters/:cluster',
    routeRef: clusterDashboardRouteRef,
    loader: () =>
      import('./components/ClusterDashboardPage').then(m => (
        <m.ClusterDashboardPage />
      )),
  },
});

export const namespaceDashboardPage = PageBlueprint.make({
  name: 'namespace-dashboard',
  params: {
    noHeader: true,
    path: '/policy-reporter-ui/clusters/:cluster/namespaces/:namespace',
    routeRef: namespaceDashboardRouteRef,
    loader: () =>
      import('./components/NamespaceDashboardPage').then(m => (
        <m.NamespaceDashboardPage />
      )),
  },
});

export const resourceDashboardPage = PageBlueprint.make({
  name: 'resource-dashboard',
  params: {
    noHeader: true,
    path: '/policy-reporter-ui/clusters/:cluster/resources/:resource',
    routeRef: resourceDashboardRouteRef,
    loader: () =>
      import('./components/ResourceDashboardPage').then(m => (
        <m.ResourceDashboardPage />
      )),
  },
});

export const customBoardDashboardPage = PageBlueprint.make({
  name: 'custom-board-dashboard',
  params: {
    noHeader: true,
    path: '/policy-reporter-ui/clusters/:cluster/custom-board/:customBoard',
    routeRef: customBoardDashboardRouteRef,
    loader: () =>
      import('./components/CustomBoard').then(m => (
        <m.Dashboard />
      )),
  },
});

export const customBoardNamespacePage = PageBlueprint.make({
  name: 'custom-board-namespace',
  params: {
    noHeader: true,
    path: '/policy-reporter-ui/clusters/:cluster/custom-board/:customBoard/namespace/:namespace',
    routeRef: customBoardNamespaceRouteRef,
    loader: () =>
      import('./components/CustomBoard').then(m => (
        <m.NamespacePage />
      )),
  },
});

export const customBoardResourcePage = PageBlueprint.make({
  name: 'custom-board-resource',
  params: {
    noHeader: true,
    path: '/policy-reporter-ui/clusters/:cluster/custom-board/:customBoard/resources/:resource',
    routeRef: customBoardResourceRouteRef,
    loader: () =>
      import('./components/CustomBoard').then(m => (
        <m.ResourcePage />
      )),
  },
});

export const policyDashboardPage = PageBlueprint.make({
  name: 'policy-dashboard',
  params: {
    noHeader: true,
    path: '/policy-reporter-ui/clusters/:cluster/policies',
    routeRef: policyDashboardRouteRef,
    loader: () =>
      import('./components/PolicyDashboard').then(m => (
        <m.DashboardPage />
      )),
  },
});

export const policyDetailsDashboardPage = PageBlueprint.make({
  name: 'policy-details-dashboard',
  params: {
    noHeader: true,
    path: '/policy-reporter-ui/clusters/:cluster/:source/policies/:policy',
    routeRef: policyDetailsDashboardRouteRef,
    loader: () =>
      import('./components/PolicyDashboard').then(m => (
        <m.DetailsPage />
      )),
  },
});

export const policyReporterUiPlugin = createFrontendPlugin({
  pluginId: 'policy-reporter-ui',
  extensions: [clusterListPage, clusterDashboardPage, namespaceDashboardPage, resourceDashboardPage, customBoardDashboardPage, customBoardNamespacePage, customBoardResourcePage, policyDashboardPage, policyDetailsDashboardPage],
  routes: {
    root: rootRouteRef,
    clusters: clusterRouteRef,
    clusterDashboard: clusterDashboardRouteRef,
    namespaceDashboard: namespaceDashboardRouteRef,
    resourceDashboard: resourceDashboardRouteRef,
    customBoardDashboard: customBoardDashboardRouteRef,
    customBoardNamespace: customBoardNamespaceRouteRef,
    customBoardResource: customBoardResourceRouteRef,
    policyDashboard: policyDashboardRouteRef,
  }
});
