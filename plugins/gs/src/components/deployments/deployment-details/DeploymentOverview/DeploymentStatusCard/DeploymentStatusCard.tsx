import { useCurrentDeployment } from '../../../DeploymentDetailsPage/useCurrentDeployment';
import { AppKind } from '@giantswarm/backstage-plugin-gs-common';
import { AppStatus } from './AppStatus';
import { HelmReleaseConditions } from './HelmReleaseConditions';

export function DeploymentStatusCard() {
  const { deployment } = useCurrentDeployment();

  return deployment.kind === AppKind ? (
    <AppStatus app={deployment} />
  ) : (
    <HelmReleaseConditions helmrelease={deployment} />
  );
}
