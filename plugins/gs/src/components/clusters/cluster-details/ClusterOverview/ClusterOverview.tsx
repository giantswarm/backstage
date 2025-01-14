import React from 'react';
import { Grid } from '@material-ui/core';
import { ClusterAboutCard } from './ClusterAboutCard';
import { ErrorsProvider } from '../../../Errors';
import { ClusterAccessCard } from './ClusterAccessCard';
import { ClusterPolicyComplianceCard } from './ClusterPolicyComplianceCard';
import { ClusterLabelsCard } from './ClusterLabelsCard';
import { ClusterInstallationCard } from './ClusterInstallationCard';
import { useCurrentCluster } from '../../ClusterDetailsPage/useCurrentCluster';
import { isManagementCluster } from '@giantswarm/backstage-plugin-gs-common';
import { ClusterToolsCard } from './ClusterToolsCard';

export const ClusterOverview = () => {
  const { cluster, installationName } = useCurrentCluster();

  return (
    <ErrorsProvider>
      <Grid container spacing={3} alignItems="stretch">
        <Grid item md={6} xs={12}>
          <Grid item container spacing={3}>
            <Grid item xs={12}>
              <ClusterAboutCard />
            </Grid>
            <Grid item xs={12}>
              <ClusterPolicyComplianceCard />
            </Grid>
            <Grid item xs={12}>
              <ClusterLabelsCard />
            </Grid>
          </Grid>
        </Grid>
        <Grid item md={6} xs={12}>
          <Grid item container spacing={3}>
            {!isManagementCluster(cluster, installationName) && (
              <Grid item xs={12}>
                <ClusterInstallationCard />
              </Grid>
            )}
            <Grid item xs={12}>
              <ClusterToolsCard />
            </Grid>
            <Grid item xs={12}>
              <ClusterAccessCard />
            </Grid>
          </Grid>
        </Grid>
      </Grid>
    </ErrorsProvider>
  );
};
