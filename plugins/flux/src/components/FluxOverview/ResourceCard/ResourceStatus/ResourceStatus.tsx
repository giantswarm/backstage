import { Box, makeStyles } from '@material-ui/core';
import { Status } from '../../../UI/Status';

const useStyles = makeStyles(theme => ({
  root: {
    position: 'absolute',
    top: theme.spacing(1),
    right: theme.spacing(2),
  },
}));

type ResourceStatusProps = {
  readyStatus: 'True' | 'False' | 'Unknown';
  isReconciling: boolean;
  isSuspended: boolean;
};

export const ResourceStatus = ({
  readyStatus,
  isReconciling,
  isSuspended,
}: ResourceStatusProps) => {
  const classes = useStyles();

  let elText = 'Unknown';
  let elStatus: 'aborted' | 'ok' | 'error' = 'aborted';
  if (readyStatus === 'True') {
    elText = 'Ready';
    elStatus = 'ok';
  } else if (readyStatus === 'False') {
    elText = 'Not ready';
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
