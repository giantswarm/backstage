import {
  coreExtensionData,
  createExtensionInput,
  createFrontendPlugin,
  NavItemBlueprint,
  PageBlueprint,
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

const fluxNavItem = NavItemBlueprint.make({
  params: {
    title: 'Flux',
    icon: FluxIcon,
    routeRef: rootRouteRef,
  },
});

const fluxPage = PageBlueprint.makeWithOverrides({
  inputs: {
    listFilters: createExtensionInput([coreExtensionData.reactElement]),
    treeFilters: createExtensionInput([coreExtensionData.reactElement]),
  },
  factory(originalFactory, { inputs }) {
    return originalFactory({
      path: '/flux',
      routeRef: rootRouteRef,
      loader: async () => {
        const { FluxPage } = await import('./components/FluxPage');
        const listFilters = inputs.listFilters.map(filter =>
          filter.get(coreExtensionData.reactElement),
        );
        const treeFilters = inputs.treeFilters.map(filter =>
          filter.get(coreExtensionData.reactElement),
        );
        return (
          <FluxPage
            listFilters={<>{listFilters}</>}
            treeFilters={<>{treeFilters}</>}
          />
        );
      },
    });
  },
});

export const fluxPlugin = createFrontendPlugin({
  pluginId: 'flux',
  extensions: [
    fluxPage,
    fluxNavItem,
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
