import { useCurrentDeployment } from '../../../DeploymentDetailsPage/useCurrentDeployment';
import { AppStatus } from './AppStatus';
import { HelmReleaseConditions } from './HelmReleaseConditions';
import { App } from '@giantswarm/backstage-plugin-kubernetes-react';

export function DeploymentStatusCard() {
  const { deployment } = useCurrentDeployment();

  return deployment instanceof App ? (
    <AppStatus app={deployment} />
  ) : (
    <HelmReleaseConditions helmrelease={deployment} />
  );
}
