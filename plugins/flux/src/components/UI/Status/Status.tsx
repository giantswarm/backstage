import { Box, makeStyles } from '@material-ui/core';
import classNames from 'classnames';

const useStyles = makeStyles(theme => ({
  root: {
    display: 'inline-block',
    position: 'relative',
    paddingLeft: theme.spacing(2),

    '&::before': {
      content: '\"\"',
      display: 'block',
      position: 'absolute',
      width: '10px',
      height: '10px',
      borderRadius: '50%',
      left: 0,
      top: '50%',

      transform: 'translate(0, -50%)',
    },
  },

  rootStatusOk: {
    '&::before': {
      backgroundColor: theme.palette.status.ok,
    },
  },

  rootStatusError: {
    '&::before': {
      backgroundColor: theme.palette.status.error,
    },
  },

  rootStatusAborted: {
    '&::before': {
      backgroundColor: theme.palette.status.aborted,
    },
  },
}));

type StatusProps = {
  text: string;
  status: 'ok' | 'error' | 'aborted';
};

export const Status = ({ text, status }: StatusProps) => {
  const classes = useStyles();

  return (
    <Box
      className={classNames(classes.root, {
        [classes.rootStatusOk]: status === 'ok',
        [classes.rootStatusError]: status === 'error',
        [classes.rootStatusAborted]: status === 'aborted',
      })}
    >
      {text}
    </Box>
  );
};
