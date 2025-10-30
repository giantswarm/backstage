import { Grid, Typography } from '@material-ui/core';
import { AppStatus } from '../../deployments/deployment-details/DeploymentOverview/DeploymentStatusCard/AppStatus';
import { App } from '@giantswarm/backstage-plugin-kubernetes-react';

type ClusterAppStatusProps = {
  app: App;
};

export const ClusterAppStatus = ({ app }: ClusterAppStatusProps) => {
  return (
    <Grid container spacing={3} alignItems="stretch">
      <Grid item md={6} xs={12}>
        <Grid item container spacing={3}>
          <Grid item xs={12}>
            <Typography variant="h4">
              Cluster creation is in progress.
            </Typography>
            <Typography variant="subtitle1">
              Below are details about the cluster App resource status.
            </Typography>
            <Typography variant="subtitle1">
              Reload the page to see the latest status.
            </Typography>
          </Grid>
          <Grid item xs={12}>
            <AppStatus app={app} />
          </Grid>
        </Grid>
      </Grid>
    </Grid>
  );
};
