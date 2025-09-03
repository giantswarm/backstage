import {
  getClusterName,
  isManagementCluster,
} from '@giantswarm/backstage-plugin-gs-common';
import { FluxStatusCard } from '@giantswarm/backstage-plugin-flux-react';
import { useCurrentCluster } from '../../../ClusterDetailsPage/useCurrentCluster';
import {
  fluxOverviewExternalRouteRef,
  fluxResourcesExternalRouteRef,
} from '../../../../../routes';

export const ClusterFluxStatusCard = () => {
  const { cluster, installationName } = useCurrentCluster();

  if (!isManagementCluster(cluster, installationName)) {
    return null;
  }

  return (
    <FluxStatusCard
      fluxOverviewRouteRef={fluxOverviewExternalRouteRef}
      fluxResourcesRouteRef={fluxResourcesExternalRouteRef}
      cluster={getClusterName(cluster)}
    />
  );
};
