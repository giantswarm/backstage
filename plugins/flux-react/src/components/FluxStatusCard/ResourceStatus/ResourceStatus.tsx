import { Box, Typography } from '@material-ui/core';
import { useFluxResources } from '../../../hooks/useFluxResources';
import { ResourceStatusRow } from './ResourceStatusRow';
import { ExternalRouteRef, useRouteRef } from '@backstage/core-plugin-api';

type ResourceStatusProps = {
  cluster: string;
  fluxResourcesRouteRef: ExternalRouteRef;
};

export const ResourceStatus = ({
  cluster,
  fluxResourcesRouteRef,
}: ResourceStatusProps) => {
  const { resources: fluxResources } = useFluxResources(cluster);

  const fluxResourcesRoute = useRouteRef(fluxResourcesRouteRef);
  const basePath = fluxResourcesRoute
    ? `${fluxResourcesRoute()}?clusters=${cluster}`
    : null;

  return (
    <Box>
      <Typography variant="subtitle2">Resource status</Typography>

      <Box display="flex" flexDirection="column">
        {Object.entries(fluxResources).map(
          ([key, resources]) =>
            resources.length > 0 && (
              <ResourceStatusRow
                key={key}
                resources={resources}
                basePath={basePath}
              />
            ),
        )}
      </Box>
    </Box>
  );
};
