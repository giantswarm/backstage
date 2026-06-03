import {
  coreExtensionData,
  createExtensionInput,
  createFrontendPlugin,
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

const fluxPage = PageBlueprint.makeWithOverrides({
  disabled: true,
  inputs: {
    listFilters: createExtensionInput([coreExtensionData.reactElement]),
    treeFilters: createExtensionInput([coreExtensionData.reactElement]),
  },
  factory(originalFactory, { inputs }) {
    return originalFactory({
      title: 'Flux',
      icon: <FluxIcon />,
      noHeader: true,
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
