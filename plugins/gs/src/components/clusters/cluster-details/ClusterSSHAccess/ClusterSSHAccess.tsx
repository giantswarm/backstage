import React from 'react';
import { Grid } from '@material-ui/core';
import { ErrorsProvider } from '../../../Errors';
import { useCurrentUser } from '../../../hooks';
import { ClusterSSHAccessCard } from './ClusterSSHAccessCard';
import { useCurrentCluster } from '../../ClusterDetailsPage/useCurrentCluster';

export const ClusterSSHAccess = () => {
  const { installationName } = useCurrentCluster();
  const { isGSUser } = useCurrentUser(installationName);

  return (
    <ErrorsProvider>
      <Grid container spacing={3} alignItems="stretch">
        <Grid item md={6} xs={12}>
          <Grid item container spacing={3}>
            {isGSUser && (
              <Grid item xs={12}>
                <ClusterSSHAccessCard />
              </Grid>
            )}
          </Grid>
        </Grid>
      </Grid>
    </ErrorsProvider>
  );
};
