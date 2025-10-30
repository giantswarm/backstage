import { FluxStatusCard } from '@giantswarm/backstage-plugin-flux-react';
import { useCurrentCluster } from '../../../ClusterDetailsPage/useCurrentCluster';
import {
  fluxOverviewExternalRouteRef,
  fluxResourcesExternalRouteRef,
} from '../../../../../routes';
import { isManagementCluster } from '../../../utils';

export const ClusterFluxStatusCard = () => {
  const { cluster } = useCurrentCluster();

  if (!isManagementCluster(cluster)) {
    return null;
  }

  return (
    <FluxStatusCard
      fluxOverviewRouteRef={fluxOverviewExternalRouteRef}
      fluxResourcesRouteRef={fluxResourcesExternalRouteRef}
      cluster={cluster.getName()}
    />
  );
};
