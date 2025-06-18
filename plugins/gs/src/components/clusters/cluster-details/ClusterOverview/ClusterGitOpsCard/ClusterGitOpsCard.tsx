import { isAppManagedByFlux } from '@giantswarm/backstage-plugin-gs-common';
import { GitOpsCard } from '../../../../GitOpsCard';
import { useCurrentCluster } from '../../../ClusterDetailsPage/useCurrentCluster';

export const ClusterGitOpsCard = () => {
  const { clusterApp, installationName } = useCurrentCluster();

  const isGitOpsManaged = isAppManagedByFlux(clusterApp);
  if (!isGitOpsManaged) {
    return null;
  }

  return (
    <GitOpsCard deployment={clusterApp} installationName={installationName} />
  );
};
