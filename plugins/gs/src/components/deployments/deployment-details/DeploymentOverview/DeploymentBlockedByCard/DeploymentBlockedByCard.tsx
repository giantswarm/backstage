import {
  FluxBlockedByCard,
  isManagedByFlux,
} from '@giantswarm/backstage-plugin-flux-react';
import { useCurrentDeployment } from '../../../DeploymentDetailsPage/useCurrentDeployment';
import { fluxOverviewExternalRouteRef } from '../../../../../routes';

export const DeploymentBlockedByCard = () => {
  const { deployment, installationName } = useCurrentDeployment();

  const isGitOpsManaged = isManagedByFlux(deployment);
  if (!isGitOpsManaged) {
    return null;
  }

  return (
    <FluxBlockedByCard
      deployment={deployment}
      installationName={installationName}
      fluxOverviewRouteRef={fluxOverviewExternalRouteRef}
    />
  );
};
