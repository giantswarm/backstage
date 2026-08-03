import {
  GitOpsCard,
  isManagedByFlux,
} from '@giantswarm/backstage-plugin-flux-react';
import { useCurrentCluster } from '../../../ClusterDetailsPage/useCurrentCluster';

export const ClusterGitOpsCard = () => {
  const { clusterApp, installationName } = useCurrentCluster();

  const isGitOpsManaged = isManagedByFlux(clusterApp);
  if (!isGitOpsManaged) {
    return null;
  }

  return (
    <GitOpsCard resource={clusterApp} installationName={installationName} />
  );
};
