import React from 'react';
import { makeStyles, Typography } from '@material-ui/core';

const useStyles = makeStyles(() => ({
  value: {
    fontWeight: 'bold',
    overflow: 'hidden',
    lineHeight: '24px',
    wordBreak: 'break-word',
  },
}));

export const AboutFieldValue = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const classes = useStyles();

  return (
    <Typography variant="body2" className={classes.value}>
      {children}
    </Typography>
  );
};
