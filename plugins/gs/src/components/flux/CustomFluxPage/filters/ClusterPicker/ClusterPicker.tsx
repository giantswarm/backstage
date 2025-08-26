import { useCallback } from 'react';
import { Box } from '@material-ui/core';
import {
  SingleClusterSelector,
  useClustersInfo,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useFluxOverviewData } from '@giantswarm/backstage-plugin-flux-react';
import { useDisabledInstallations } from '../../../../hooks';

export const ClusterPicker = () => {
  const { clusters, isLoadingClusters } = useClustersInfo();
  const { disabledInstallations, isLoading: isLoadingDisabledClusters } =
    useDisabledInstallations();
  const { setActiveCluster } = useFluxOverviewData();

  const handleActiveClusterChange = useCallback(
    (selectedItem: string | null) => {
      setActiveCluster(selectedItem);
    },
    [setActiveCluster],
  );

  return (
    <Box py={clusters.length > 1 ? 1 : undefined}>
      <SingleClusterSelector
        clusters={clusters}
        disabledClusters={disabledInstallations}
        isLoadingDisabledClusters={isLoadingDisabledClusters}
        disabled={isLoadingClusters}
        onActiveClusterChange={handleActiveClusterChange}
      />
    </Box>
  );
};
