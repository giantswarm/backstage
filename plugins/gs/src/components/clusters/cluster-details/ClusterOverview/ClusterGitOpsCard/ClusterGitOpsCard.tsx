import {
  GitOpsCard,
  isManagedByFlux,
} from '@giantswarm/backstage-plugin-flux-react';
import { useCurrentCluster } from '../../../ClusterDetailsPage/useCurrentCluster';

export const ClusterGitOpsCard = () => {
  const { clusterApp, clusterRelease, installationName } = useCurrentCluster();
  const installer = clusterApp ?? clusterRelease;

  if (!installer || !isManagedByFlux(installer)) {
    return null;
  }

  return (
    <GitOpsCard resource={installer} installationName={installationName} />
  );
};
