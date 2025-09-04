import { Box } from '@material-ui/core';
import {
  SingleClusterSelector,
  useClustersInfo,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useFluxOverviewData } from '@giantswarm/backstage-plugin-flux-react';
import { useDisabledInstallations } from '../../../../hooks';

export const ClusterPicker = () => {
  const { clusters, isLoading } = useClustersInfo();
  const { disabledInstallations, isLoading: isLoadingDisabledClusters } =
    useDisabledInstallations();
  const { setActiveCluster } = useFluxOverviewData();

  return (
    <Box py={clusters.length > 1 ? 1 : 0}>
      <SingleClusterSelector
        clusters={clusters}
        disabledClusters={disabledInstallations}
        isLoadingDisabledClusters={isLoadingDisabledClusters}
        disabled={isLoading}
        onActiveClusterChange={setActiveCluster}
      />
    </Box>
  );
};
