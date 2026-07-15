import { FluxBlockedByCard } from '@giantswarm/backstage-plugin-flux-react';
import { useCurrentDeployment } from '../../../DeploymentDetailsPage/useCurrentDeployment';
import { fluxOverviewExternalRouteRef } from '../../../../../routes';

export const DeploymentBlockedByCard = () => {
  const { deployment, installationName } = useCurrentDeployment();

  return (
    <FluxBlockedByCard
      deployment={deployment}
      installationName={installationName}
      fluxOverviewRouteRef={fluxOverviewExternalRouteRef}
    />
  );
};
