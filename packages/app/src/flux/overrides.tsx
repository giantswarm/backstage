import { createFrontendModule } from '@backstage/frontend-plugin-api';
import {
  FluxListFilterBlueprint,
  FluxTreeFilterBlueprint,
} from '@giantswarm/backstage-plugin-flux-react/alpha';

const listClusterPickerOverride = FluxListFilterBlueprint.make({
  name: 'cluster-picker',
  params: {
    loader: async () => {
      const { FluxResourcesListViewClusterPicker } =
        await import('@giantswarm/backstage-plugin-flux-react');
      const { useDisabledInstallations } =
        await import('@giantswarm/backstage-plugin-gs');

      const ListClusterPickerWithDisabled = () => {
        const { disabledInstallations, isLoading } = useDisabledInstallations();
        return (
          <FluxResourcesListViewClusterPicker
            disabledClusters={disabledInstallations}
            isLoadingDisabledClusters={isLoading}
          />
        );
      };

      return <ListClusterPickerWithDisabled />;
    },
  },
});

const treeClusterPickerOverride = FluxTreeFilterBlueprint.make({
  name: 'cluster-picker',
  params: {
    loader: async () => {
      const { FluxResourcesTreeViewClusterPicker } =
        await import('@giantswarm/backstage-plugin-flux-react');
      const { useDisabledInstallations } =
        await import('@giantswarm/backstage-plugin-gs');

      const TreeClusterPickerWithDisabled = () => {
        const { disabledInstallations, isLoading } = useDisabledInstallations();
        return (
          <FluxResourcesTreeViewClusterPicker
            disabledClusters={disabledInstallations}
            isLoadingDisabledClusters={isLoading}
          />
        );
      };

      return <TreeClusterPickerWithDisabled />;
    },
  },
});

export const fluxPluginOverrides = createFrontendModule({
  pluginId: 'flux',
  extensions: [listClusterPickerOverride, treeClusterPickerOverride],
});
