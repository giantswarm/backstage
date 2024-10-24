import React from 'react';
import { Grid } from '@material-ui/core';
import { ClusterAboutCard } from './ClusterAboutCard';
import { ErrorsProvider } from '../../../Errors';
import { ClusterAccessCard } from './ClusterAccessCard';

export const ClusterOverview = () => {
  return (
    <ErrorsProvider>
      <Grid container spacing={3} alignItems="stretch">
        <Grid item md={6} xs={12}>
          <ClusterAboutCard />
        </Grid>
        <Grid item md={6} xs={12}>
          <ClusterAccessCard />
        </Grid>
      </Grid>
    </ErrorsProvider>
  );
};
