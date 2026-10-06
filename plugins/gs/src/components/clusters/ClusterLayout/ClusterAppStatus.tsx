import { Grid, Typography } from '@material-ui/core';
import { AppStatus } from '../../deployments/deployment-details/DeploymentOverview/DeploymentStatusCard/AppStatus';
import { HelmReleaseConditions } from '../../deployments/deployment-details/DeploymentOverview/DeploymentStatusCard/HelmReleaseConditions';
import {
  App,
  HelmRelease,
} from '@giantswarm/backstage-plugin-kubernetes-react';

type ClusterAppStatusProps = {
  /** The App or HelmRelease that installs the cluster. */
  installer: App | HelmRelease;
};

export const ClusterAppStatus = ({ installer }: ClusterAppStatusProps) => {
  return (
    <Grid container spacing={3} alignItems="stretch">
      <Grid item md={6} xs={12}>
        <Grid item container spacing={3}>
          <Grid item xs={12}>
            <Typography variant="h4">
              Cluster creation is in progress.
            </Typography>
            <Typography variant="subtitle1">
              Below are details about the cluster {installer.getKind()} resource
              status.
            </Typography>
            <Typography variant="subtitle1">
              Reload the page to see the latest status.
            </Typography>
          </Grid>
          <Grid item xs={12}>
            {installer instanceof App ? (
              <AppStatus app={installer} />
            ) : (
              <HelmReleaseConditions helmrelease={installer} />
            )}
          </Grid>
        </Grid>
      </Grid>
    </Grid>
  );
};
