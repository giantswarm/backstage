import {
  FluxListFilterBlueprint,
  FluxTreeFilterBlueprint,
} from '@giantswarm/backstage-plugin-flux-react/alpha';

// List view default filters
export const listClusterPicker = FluxListFilterBlueprint.make({
  name: 'cluster-picker',
  params: {
    loader: async () => {
      const { FluxResourcesListViewClusterPicker } =
        await import('@giantswarm/backstage-plugin-flux-react');
      return <FluxResourcesListViewClusterPicker />;
    },
  },
});

export const listKindPicker = FluxListFilterBlueprint.make({
  name: 'kind-picker',
  params: {
    loader: async () => {
      const { FluxResourcesListViewKindPicker } =
        await import('@giantswarm/backstage-plugin-flux-react');
      return <FluxResourcesListViewKindPicker />;
    },
  },
});

export const listStatusPicker = FluxListFilterBlueprint.make({
  name: 'status-picker',
  params: {
    loader: async () => {
      const { FluxResourcesListViewStatusPicker } =
        await import('@giantswarm/backstage-plugin-flux-react');
      return <FluxResourcesListViewStatusPicker />;
    },
  },
});

// Tree view default filters
export const treeClusterPicker = FluxTreeFilterBlueprint.make({
  name: 'cluster-picker',
  params: {
    loader: async () => {
      const { FluxResourcesTreeViewClusterPicker } =
        await import('@giantswarm/backstage-plugin-flux-react');
      return <FluxResourcesTreeViewClusterPicker />;
    },
  },
});

export const treeResourceTypePicker = FluxTreeFilterBlueprint.make({
  name: 'resource-type-picker',
  params: {
    loader: async () => {
      const { FluxResourcesTreeViewResourceTypePicker } =
        await import('@giantswarm/backstage-plugin-flux-react');
      return <FluxResourcesTreeViewResourceTypePicker />;
    },
  },
});

export const treeSearch = FluxTreeFilterBlueprint.make({
  name: 'tree-search',
  params: {
    loader: async () => {
      const { FluxResourcesTreeViewTreeSearch } =
        await import('@giantswarm/backstage-plugin-flux-react');
      return <FluxResourcesTreeViewTreeSearch />;
    },
  },
});
