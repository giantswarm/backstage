import React from 'react';
import { makeStyles, Typography } from '@material-ui/core';

const useStyles = makeStyles(() => ({
  root: {
    whiteSpace: 'pre-line',
  },
}));

export const StatusMessage = ({ children }: { children: React.ReactNode }) => {
  const classes = useStyles();

  return (
    <Typography variant="inherit" className={classes.root}>
      {children}
    </Typography>
  );
};
