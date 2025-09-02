import { Box, Typography } from '@material-ui/core';
import { useFluxResources } from '../../../hooks/useFluxResources';
import { ResourceStatusRow } from './ResourceStatusRow';
import { makeStyles } from '@material-ui/core/styles';
import { ExternalRouteRef, useRouteRef } from '@backstage/core-plugin-api';

const useStyles = makeStyles(() => ({
  title: {
    fontWeight: 500,
  },
}));

type ResourceStatusProps = {
  cluster: string;
  fluxResourcesRouteRef: ExternalRouteRef;
};

export const ResourceStatus = ({
  cluster,
  fluxResourcesRouteRef,
}: ResourceStatusProps) => {
  const classes = useStyles();

  const { resources: fluxResources } = useFluxResources(cluster);

  const fluxResourcesRoute = useRouteRef(fluxResourcesRouteRef);
  const basePath = fluxResourcesRoute
    ? `${fluxResourcesRoute()}?clusters=${cluster}`
    : null;

  return (
    <Box>
      <Typography className={classes.title}>ResourceStatus</Typography>

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
