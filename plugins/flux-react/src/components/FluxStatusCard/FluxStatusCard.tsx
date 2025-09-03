import { Link as RouterLink } from 'react-router-dom';
import { InfoCard, Link } from '@backstage/core-components';
import { Box, Typography } from '@material-ui/core';
import { KubernetesQueryClientProvider } from '@giantswarm/backstage-plugin-kubernetes-react';
import { ExternalRouteRef, useRouteRef } from '@backstage/core-plugin-api';
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
    <KubernetesQueryClientProvider>
      <InfoCard
        title="Flux status"
        action={
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
    </KubernetesQueryClientProvider>
  );
};
