import { useCurrentDeployment } from '../../../DeploymentDetailsPage/useCurrentDeployment';
import { GitOpsCard } from '../../../../GitOpsCard';
import { isManagedByFlux } from '../../../utils/isManagedByFlux';

export const DeploymentGitOpsCard = () => {
  const { deployment, installationName } = useCurrentDeployment();

  const isGitOpsManaged = isManagedByFlux(deployment);
  if (!isGitOpsManaged) {
    return null;
  }

  return (
    <GitOpsCard deployment={deployment} installationName={installationName} />
  );
};
