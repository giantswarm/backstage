import { Grid } from '@material-ui/core';
import { GridItem } from '../../../UI';
import { DeploymentHttpRoutesCard } from './DeploymentHttpRoutesCard';

export const DeploymentGateway = () => (
  <Grid container spacing={3} alignItems="stretch">
    <GridItem xs={12}>
      <DeploymentHttpRoutesCard />
    </GridItem>
  </Grid>
);
