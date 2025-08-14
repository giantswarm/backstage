import { Box, makeStyles } from '@material-ui/core';
import { Status } from '../../../UI/Status';

const useStyles = makeStyles(() => ({
  root: {
    whiteSpace: 'nowrap',
  },
}));

type ResourceStatusProps = {
  readyStatus: 'True' | 'False' | 'Unknown';
  isDependencyNotReady: boolean;
  isReconciling: boolean;
  isSuspended: boolean;
};

export const ResourceStatus = ({
  readyStatus,
  isDependencyNotReady,
  isReconciling,
  isSuspended,
}: ResourceStatusProps) => {
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
