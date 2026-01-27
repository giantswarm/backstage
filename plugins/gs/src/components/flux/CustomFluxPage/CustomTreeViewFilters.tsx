import {
  FluxResourcesTreeViewResourceTypePicker,
  FluxResourcesTreeViewClusterPicker,
  FluxResourcesTreeViewTreeSearch,
} from '@giantswarm/backstage-plugin-flux-react';
import { useDisabledInstallations } from '../../hooks';

export const CustomTreeViewFilters = () => {
  const { disabledInstallations, isLoading: isLoadingDisabledInstallations } =
    useDisabledInstallations();

  return (
    <>
      <FluxResourcesTreeViewClusterPicker
        disabledClusters={disabledInstallations}
        isLoadingDisabledClusters={isLoadingDisabledInstallations}
      />
      <FluxResourcesTreeViewResourceTypePicker />
      <FluxResourcesTreeViewTreeSearch />
    </>
  );
};
