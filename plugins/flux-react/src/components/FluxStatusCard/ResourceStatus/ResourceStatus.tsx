import { Box, Typography } from '@material-ui/core';
import { useFluxResources } from '../../FluxOverviewDataProvider/useFluxResources';
import { ResourceStatusRow } from './ResourceStatusRow';
import { makeStyles } from '@material-ui/core/styles';

const useStyles = makeStyles(() => ({
  title: {
    fontWeight: 500,
  },
}));

type ResourceStatusProps = {
  cluster: string;
};

export const ResourceStatus = ({ cluster }: ResourceStatusProps) => {
  const classes = useStyles();

  const { resources: fluxResources } = useFluxResources(cluster);

  const basePath = `/flux/list?clusters=${cluster}`;

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
