import { Box } from '@material-ui/core';
import {
  SingleClusterSelector,
  useClustersInfo,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useFluxOverviewData } from '@giantswarm/backstage-plugin-flux-react';

export const ClusterPicker = () => {
  const { clusters } = useClustersInfo();
  const { setActiveCluster } = useFluxOverviewData();

  if (clusters.length <= 1) {
    return null;
  }

  return (
    <Box pb={1} pt={1}>
      <SingleClusterSelector
        clusters={clusters}
        onActiveClusterChange={setActiveCluster}
      />
    </Box>
  );
};
