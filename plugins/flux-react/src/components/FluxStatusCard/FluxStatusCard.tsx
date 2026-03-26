import { Link as RouterLink } from 'react-router-dom';
import { Link } from '@backstage/core-components';
import { InfoCard } from '@giantswarm/backstage-plugin-ui-react';
import { Box, Typography } from '@material-ui/core';
import { ExternalRouteRef, useRouteRef } from '@backstage/frontend-plugin-api';
import { DeploymentStatus } from './DeploymentStatus';
import { ResourceStatus } from './ResourceStatus';

type FluxStatusCardProps = {
  cluster: string;
  fluxOverviewRouteRef: ExternalRouteRef;
  fluxResourcesRouteRef: ExternalRouteRef;
};

export const FluxStatusCard = ({
  cluster,
  fluxOverviewRouteRef,
  fluxResourcesRouteRef,
}: FluxStatusCardProps) => {
  const fluxOverviewRoute = useRouteRef(fluxOverviewRouteRef);
  const fluxOverviewUrl = fluxOverviewRoute
    ? `${fluxOverviewRoute()}?cluster=${cluster}`
    : null;

  return (
    <InfoCard
      title="Flux status"
      headerActions={
        fluxOverviewUrl ? (
          <Box mt={1} mr={1} pt={1}>
            <Link component={RouterLink} to={fluxOverviewUrl}>
              <Typography variant="body1">Flux overview</Typography>
            </Link>
          </Box>
        ) : null
      }
    >
      <DeploymentStatus cluster={cluster} />
      <ResourceStatus
        cluster={cluster}
        fluxResourcesRouteRef={fluxResourcesRouteRef}
      />
    </InfoCard>
  );
};
