import { isManagedByFlux } from '../../../../deployments/utils/isManagedByFlux';
import { GitOpsCard } from '../../../../GitOpsCard';
import { useCurrentCluster } from '../../../ClusterDetailsPage/useCurrentCluster';

export const ClusterGitOpsCard = () => {
  const { clusterApp, installationName } = useCurrentCluster();

  const isGitOpsManaged = isManagedByFlux(clusterApp);
  if (!isGitOpsManaged) {
    return null;
  }

  return (
    <GitOpsCard deployment={clusterApp} installationName={installationName} />
  );
};
