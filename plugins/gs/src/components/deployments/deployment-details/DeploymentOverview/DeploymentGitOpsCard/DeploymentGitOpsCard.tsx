import {
  GitOpsCard,
  isManagedByFlux,
} from '@giantswarm/backstage-plugin-flux-react';
import { useCurrentDeployment } from '../../../DeploymentDetailsPage/useCurrentDeployment';

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
