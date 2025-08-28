import { Box } from '@material-ui/core';
import {
  SingleClusterSelector,
  useClustersInfo,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useFluxOverviewData } from '../../../FluxOverviewDataProvider';

export const ClusterPicker = () => {
  const { clusters, isLoadingClusters } = useClustersInfo();
  const { setActiveCluster } = useFluxOverviewData();

  return (
    <Box py={clusters.length > 1 ? 1 : 0}>
      <SingleClusterSelector
        clusters={clusters}
        disabled={isLoadingClusters}
        onActiveClusterChange={setActiveCluster}
      />
    </Box>
  );
};
