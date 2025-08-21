import { Box } from '@material-ui/core';
import {
  MultipleClustersSelector,
  useClustersInfo,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useFluxResourcesData } from '../../../FluxResourcesDataProvider';

export const ClusterPicker = () => {
  const { clusters, isLoadingClusters } = useClustersInfo();
  const { setActiveClusters } = useFluxResourcesData();

  if (clusters.length <= 1) {
    return null;
  }

  return (
    <Box pb={1} pt={1}>
      <MultipleClustersSelector
        clusters={clusters}
        disabled={isLoadingClusters}
        onActiveClustersChange={setActiveClusters}
      />
    </Box>
  );
};
