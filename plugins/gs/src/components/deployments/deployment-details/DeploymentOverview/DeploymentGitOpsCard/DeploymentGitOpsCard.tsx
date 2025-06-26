import {
  AppKind,
  isAppManagedByFlux,
  isHelmReleaseManagedByFlux,
} from '@giantswarm/backstage-plugin-gs-common';
import { useCurrentDeployment } from '../../../DeploymentDetailsPage/useCurrentDeployment';
import { GitOpsCard } from '../../../../GitOpsCard';

export const DeploymentGitOpsCard = () => {
  const { deployment, installationName } = useCurrentDeployment();

  const isGitOpsManaged =
    deployment.kind === AppKind
      ? isAppManagedByFlux(deployment)
      : isHelmReleaseManagedByFlux(deployment);
  if (!isGitOpsManaged) {
    return null;
  }

  return (
    <GitOpsCard deployment={deployment} installationName={installationName} />
  );
};
