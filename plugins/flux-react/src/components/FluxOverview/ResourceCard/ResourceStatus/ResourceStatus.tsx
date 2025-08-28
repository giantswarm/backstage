import { Box, makeStyles } from '@material-ui/core';
import { Status } from '../../../UI/Status';
import { FluxResourceStatus } from '@giantswarm/backstage-plugin-kubernetes-react';

const useStyles = makeStyles(() => ({
  root: {
    whiteSpace: 'nowrap',
  },
}));

export const ResourceStatus = ({
  readyStatus,
  isDependencyNotReady,
  isReconciling,
  isSuspended,
}: FluxResourceStatus) => {
  const classes = useStyles();

  let elText = 'Unknown';
  let elStatus: 'aborted' | 'ok' | 'error' = 'aborted';
  if (readyStatus === 'True') {
    elText = 'Ready';
    elStatus = 'ok';
  } else if (readyStatus === 'False' && !isDependencyNotReady) {
    elText = 'Not ready';
    elStatus = 'error';
  } else if (readyStatus === 'False' && isDependencyNotReady) {
    elText = 'Not ready (dep)';
    elStatus = 'error';
  }
  if (isReconciling) {
    elText += ', reconciling';
  }

  if (isSuspended) {
    elText = 'Suspended';
    elStatus = 'aborted';
  }

  return (
    <Box className={classes.root}>
      <Status text={elText} status={elStatus} />
    </Box>
  );
};
