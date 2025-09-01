import classNames from 'classnames';
import { Box, Button, makeStyles, Typography } from '@material-ui/core';
import { colord } from 'colord';
import { FluxObject } from '@giantswarm/backstage-plugin-kubernetes-react';
import { useMemo } from 'react';
import { getAggregatedStatus } from '../../../utils/getAggregatedStatus';

const HOVER_DARKEN_AMOUNT = 0.05;
const useStyles = makeStyles(theme => {
  const inactiveColor = theme.palette.type === 'light' ? '#e0e0e0' : '#3c3c3c';
  const inactiveColorHover =
    theme.palette.type === 'light'
      ? colord(inactiveColor).darken(HOVER_DARKEN_AMOUNT).toHex()
      : colord(inactiveColor).lighten(HOVER_DARKEN_AMOUNT).toHex();

  const failedColor = theme.palette.type === 'light' ? '#ffe6e6' : '#693636';
  const failedColorHover =
    theme.palette.type === 'light'
      ? colord(failedColor).darken(HOVER_DARKEN_AMOUNT).toHex()
      : colord(failedColor).lighten(HOVER_DARKEN_AMOUNT).toHex();

  return {
    buttons: {
      display: 'flex',
      flexWrap: 'wrap',
      marginLeft: theme.spacing(2),
      marginTop: -theme.spacing(0.25),
      marginBottom: -theme.spacing(0.25),
    },
    button: {
      marginRight: theme.spacing(1),
      marginTop: theme.spacing(0.25),
      marginBottom: theme.spacing(0.25),
      textTransform: 'none',
      whiteSpace: 'nowrap',

      '&:last-child': {
        marginRight: 0,
      },
    },
    buttonInactive: {
      backgroundColor: inactiveColor,

      '&:hover': {
        backgroundColor: inactiveColorHover,
      },
    },
    buttonFailed: {
      backgroundColor: failedColor,

      '&:hover': {
        backgroundColor: failedColorHover,
      },
    },
  };
});

type ResourceStatusRowProps = {
  resources: FluxObject[];
  basePath: string;
};

export const ResourceStatusRow = ({
  resources,
  basePath,
}: ResourceStatusRowProps) => {
  const classes = useStyles();

  const kind = resources[0].getKind();

  const stats = useMemo(() => {
    const statuses = resources.map(resource =>
      getAggregatedStatus(resource.getOrCalculateFluxStatus()),
    );

    const ready = statuses.filter(status => status === 'ready').length;
    const inactive = statuses.filter(status => status === 'inactive').length;
    const failed = statuses.filter(status => status === 'not-ready').length;
    const unknown = statuses.filter(status => status === 'unknown').length;

    return { ready, inactive, failed, unknown };
  }, [resources]);

  const path = `${basePath}&filters%5Bkind%5D=${kind}`;

  return (
    <Box display="flex" alignItems="baseline" mt={1}>
      <Box minWidth={130}>
        <Typography variant="body2">{kind}</Typography>
      </Box>

      <Box className={classes.buttons}>
        {stats.ready > 0 && (
          <Button
            variant="outlined"
            size="small"
            className={classNames(classes.button)}
            href={`${path}&filters%5Bstatus%5D=ready`}
          >
            {stats.ready} Ready
          </Button>
        )}

        {stats.inactive > 0 && (
          <Button
            variant="outlined"
            size="small"
            className={classNames(classes.button, classes.buttonInactive)}
            href={`${path}&filters%5Bstatus%5D=inactive`}
          >
            {stats.inactive} Inactive
          </Button>
        )}

        {stats.failed > 0 && (
          <Button
            variant="outlined"
            size="small"
            className={classNames(classes.button, classes.buttonFailed)}
            href={`${path}&filters%5Bstatus%5D=not-ready`}
          >
            {stats.failed} Failed
          </Button>
        )}
        {stats.unknown > 0 && (
          <Button
            variant="outlined"
            size="small"
            className={classNames(classes.button)}
            href={`${path}&filters%5Bstatus%5D=unknown`}
          >
            {stats.unknown} Unknown
          </Button>
        )}
      </Box>
    </Box>
  );
};
