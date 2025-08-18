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
  const { disabledInstallations } = useDisabledInstallations();
  const { setSelectedCluster } = useFluxOverviewData();

  const handleSelectedClusterChange = useCallback(
    (selectedItem: string | null) => {
      setSelectedCluster(selectedItem);
    },
    [setSelectedCluster],
  );

  if (clusters.length <= 1) {
    return null;
  }

  return (
    <Box pb={1} pt={1}>
      <SingleClusterSelector
        clusters={clusters}
        disabledClusters={disabledInstallations}
        disabled={isLoadingClusters}
        onChange={handleSelectedClusterChange}
      />
    </Box>
  );
};
