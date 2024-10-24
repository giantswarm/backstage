import { Box, Grid, makeStyles, Typography } from '@material-ui/core';
import React from 'react';

const useStyles = makeStyles(theme => ({
  label: {
    display: 'flex',
    justifyContent: 'space-between',
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.palette.divider}`,
  },
  labelKey: {
    backgroundColor: theme.palette.background.default,
    borderRadius: `${theme.shape.borderRadius}px 0 0 ${theme.shape.borderRadius}px`,
    padding: theme.spacing(1),
  },
  labelValue: {
    padding: theme.spacing(1),
    borderRadius: `0 ${theme.shape.borderRadius}px ${theme.shape.borderRadius}px 0`,
  },
}));

type ClusterLabelsProps = {
  labels: {
    key: string;
    value: string;
    displayKey: string;
    displayValue: string;
    textColor?: string;
    backgroundColor?: string;
  }[];
  displayRawLabels: boolean;
};

export const ClusterLabels = ({
  labels,
  displayRawLabels,
}: ClusterLabelsProps) => {
  const classes = useStyles();

  return (
    <Grid container spacing={1}>
      {labels.map(label => (
        <Grid item key={label.key}>
          <Box className={classes.label} alignItems="baseline">
            <Box className={classes.labelKey}>
              <Typography variant="subtitle2" component="p">
                {displayRawLabels ? label.key : label.displayKey}
              </Typography>
            </Box>
            <Box className={classes.labelValue}>
              <Typography variant="body2">
                {displayRawLabels ? label.value : label.displayValue}
              </Typography>
            </Box>
          </Box>
        </Grid>
      ))}
    </Grid>
  );
};
