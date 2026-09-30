import {
  GitOpsCard,
  isManagedByFlux,
} from '@giantswarm/backstage-plugin-flux-react';
import { useCurrentCluster } from '../../../ClusterDetailsPage/useCurrentCluster';

export const ClusterGitOpsCard = () => {
  const { clusterApp, installationName } = useCurrentCluster();

  // A cluster being deleted may have lost its App already.
  if (!clusterApp || !isManagedByFlux(clusterApp)) {
    return null;
  }

  return (
    <GitOpsCard resource={clusterApp} installationName={installationName} />
  );
};
