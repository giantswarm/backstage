import { Box } from '@material-ui/core';
import {
  MultipleClustersSelector,
  useClustersInfo,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useFluxResourcesData } from '@giantswarm/backstage-plugin-flux-react';
import { useDisabledInstallations } from '../../../../hooks';

export const ClusterPicker = () => {
  const { clusters, isLoading } = useClustersInfo();
  const { disabledInstallations, isLoading: isLoadingDisabledClusters } =
    useDisabledInstallations();
  const { setActiveClusters } = useFluxResourcesData();

  return (
    <Box py={clusters.length > 1 ? 1 : 0}>
      <MultipleClustersSelector
        clusters={clusters}
        disabledClusters={disabledInstallations}
        isLoadingDisabledClusters={isLoadingDisabledClusters}
        disabled={isLoading}
        onActiveClustersChange={setActiveClusters}
      />
    </Box>
  );
};
