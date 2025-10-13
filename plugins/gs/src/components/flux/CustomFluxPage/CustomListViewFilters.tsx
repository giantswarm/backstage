import {
  FluxResourcesListViewKindPicker,
  FluxResourcesListViewStatusPicker,
  FluxResourcesListViewClusterPicker,
} from '@giantswarm/backstage-plugin-flux-react';
import { useDisabledInstallations } from '../../hooks';

export const CustomListViewFilters = () => {
  const { disabledInstallations, isLoading: isLoadingDisabledInstallations } =
    useDisabledInstallations();

  return (
    <>
      <FluxResourcesListViewClusterPicker
        disabledClusters={disabledInstallations}
        isLoadingDisabledClusters={isLoadingDisabledInstallations}
      />
      <FluxResourcesListViewKindPicker />
      <FluxResourcesListViewStatusPicker />
    </>
  );
};
