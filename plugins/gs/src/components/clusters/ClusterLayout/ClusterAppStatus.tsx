import { Grid, Typography } from '@material-ui/core';
import { AppDetails } from '../../deployments/AppDetails';

type ClusterAppStatusProps = {
  installationName: string;
  name: string;
  namespace: string;
};

export const ClusterAppStatus = ({
  installationName,
  name,
  namespace,
}: ClusterAppStatusProps) => {
  return (
    <Grid container spacing={3} alignItems="stretch">
      <Grid item md={6} xs={12}>
        <Grid item container spacing={3}>
          <Grid item xs={12}>
            <Typography variant="h4">
              Cluster creation is in progress.
            </Typography>
            <Typography variant="subtitle1">
              Below are details about the cluster App resource.
            </Typography>
            <Typography variant="subtitle1">
              Reload the page to see the latest status.
            </Typography>
          </Grid>
          <Grid item xs={12}>
            <AppDetails
              installationName={installationName}
              name={name}
              namespace={namespace}
            />
          </Grid>
        </Grid>
      </Grid>
    </Grid>
  );
};
