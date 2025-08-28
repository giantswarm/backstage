import { Box } from '@material-ui/core';
import {
  MultipleClustersSelector,
  useClustersInfo,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useFluxResourcesData } from '../../../FluxResourcesDataProvider';

export const ClusterPicker = () => {
  const { clusters, isLoadingClusters } = useClustersInfo();
  const { setActiveClusters } = useFluxResourcesData();

  return (
    <Box py={clusters.length > 1 ? 1 : 0}>
      <MultipleClustersSelector
        clusters={clusters}
        disabled={isLoadingClusters}
        onActiveClustersChange={setActiveClusters}
      />
    </Box>
  );
};
