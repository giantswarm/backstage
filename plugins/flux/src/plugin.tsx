import {
  coreExtensionData,
  createExtensionInput,
  createFrontendPlugin,
  PageBlueprint,
  SubPageBlueprint,
} from '@backstage/frontend-plugin-api';

import { FluxIcon } from '@giantswarm/backstage-plugin-flux-react';

import {
  rootRouteRef,
  resourcesSubRouteRef,
  overviewSubRouteRef,
} from './routes';

import {
  listClusterPicker,
  listKindPicker,
  listStatusPicker,
  treeClusterPicker,
  treeResourceTypePicker,
  treeSearch,
} from './filters';

const fluxPage = PageBlueprint.make({
  disabled: true,
  params: {
    title: 'Flux',
    icon: <FluxIcon />,
    path: '/flux',
    routeRef: rootRouteRef,
  },
});

const fluxListSubPage = SubPageBlueprint.makeWithOverrides({
  name: 'list',
  inputs: {
    filters: createExtensionInput([coreExtensionData.reactElement]),
  },
  factory(originalFactory, { inputs }) {
    return originalFactory({
      path: 'list',
      title: 'List view',
      loader: async () => {
        const { FluxResourcesListPage } =
          await import('./components/FluxResourcesListPage');
        const filters = inputs.filters.map(filter =>
          filter.get(coreExtensionData.reactElement),
        );
        return <FluxResourcesListPage filters={<>{filters}</>} />;
      },
    });
  },
});

const fluxTreeSubPage = SubPageBlueprint.makeWithOverrides({
  name: 'tree',
  inputs: {
    filters: createExtensionInput([coreExtensionData.reactElement]),
  },
  factory(originalFactory, { inputs }) {
    return originalFactory({
      path: 'tree',
      title: 'Tree view',
      loader: async () => {
        const { FluxResourcesTreePage } =
          await import('./components/FluxResourcesTreePage');
        const filters = inputs.filters.map(filter =>
          filter.get(coreExtensionData.reactElement),
        );
        return <FluxResourcesTreePage filters={<>{filters}</>} />;
      },
    });
  },
});

export const fluxPlugin = createFrontendPlugin({
  pluginId: 'flux',
  extensions: [
    fluxPage,
    fluxListSubPage,
    fluxTreeSubPage,
    listClusterPicker,
    listKindPicker,
    listStatusPicker,
    treeClusterPicker,
    treeResourceTypePicker,
    treeSearch,
  ],
  routes: {
    root: rootRouteRef,
    overview: overviewSubRouteRef,
    resources: resourcesSubRouteRef,
  },
});
