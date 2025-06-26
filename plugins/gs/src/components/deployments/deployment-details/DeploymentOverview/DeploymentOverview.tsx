import { Grid } from '@material-ui/core';
import { DeploymentAboutCard } from './DeploymentAboutCard';
import { DeploymentLabelsCard } from './DeploymentLabelsCard';
import { DeploymentAnnotationsCard } from './DeploymentAnnotationsCard';
import { DeploymentToolsCard } from './DeploymentToolsCard';
import { DeploymentStatusCard } from './DeploymentStatusCard';
import { DeploymentRevisionsCard } from './DeploymentRevisionsCard';
import { GridItem } from '../../../UI';
import { DeploymentGitOpsCard } from './DeploymentGitOpsCard';

export const DeploymentOverview = () => (
  <Grid container spacing={3} alignItems="stretch">
    {/* Left column section */}
    <GridItem md={6} xs={12}>
      <GridItem container spacing={3}>
        <GridItem xs={12}>
          <DeploymentAboutCard />
        </GridItem>

        <GridItem xs={12}>
          <DeploymentLabelsCard />
        </GridItem>
        <GridItem xs={12}>
          <DeploymentAnnotationsCard />
        </GridItem>
      </GridItem>
    </GridItem>

    {/* Right column section */}
    <GridItem md={6} xs={12}>
      <GridItem container spacing={3}>
        <GridItem xs={12}>
          <DeploymentToolsCard />
        </GridItem>
        <GridItem xs={12}>
          <DeploymentGitOpsCard />
        </GridItem>
        <GridItem xs={12}>
          <DeploymentRevisionsCard />
        </GridItem>
        <GridItem xs={12}>
          <DeploymentStatusCard />
        </GridItem>
      </GridItem>
    </GridItem>
  </Grid>
);
