import {
  getClusterName,
  isManagementCluster,
} from '@giantswarm/backstage-plugin-gs-common';
import { useCurrentCluster } from '../../../ClusterDetailsPage/useCurrentCluster';
import { FluxStatusCard } from '@giantswarm/backstage-plugin-flux-react';

export const ClusterFluxStatusCard = () => {
  const { cluster, installationName } = useCurrentCluster();

  if (!isManagementCluster(cluster, installationName)) {
    return null;
  }

  return <FluxStatusCard cluster={getClusterName(cluster)} />;
};
