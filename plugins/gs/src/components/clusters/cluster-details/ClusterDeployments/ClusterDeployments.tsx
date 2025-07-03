import { Grid } from '@material-ui/core';
import { GridItem } from '../../../UI';
import { ClusterDeploymentsCard } from './ClusterDeploymentsCard';

export const ClusterDeployments = () => (
  <Grid container spacing={3} alignItems="stretch">
    <GridItem xs={12}>
      <ClusterDeploymentsCard />
    </GridItem>
  </Grid>
);
