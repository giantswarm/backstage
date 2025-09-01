import { Grid } from '@material-ui/core';
import { ClusterAboutCard } from './ClusterAboutCard';
import { ClusterAccessCard } from './ClusterAccessCard';
import { ClusterPolicyComplianceCard } from './ClusterPolicyComplianceCard';
import { ClusterLabelsCard } from './ClusterLabelsCard';
import { ClusterToolsCard } from './ClusterToolsCard';
import { ClusterAnnotationsCard } from './ClusterAnnotationsCard';
import { ClusterGitOpsCard } from './ClusterGitOpsCard';
import { GridItem } from '../../../UI';
import { ClusterFluxStatusCard } from './ClusterFluxStatusCard';

export const ClusterOverview = () => (
  <Grid container spacing={3} alignItems="stretch">
    {/* Left column section */}
    <GridItem md={6} xs={12}>
      <GridItem container spacing={3}>
        <GridItem xs={12}>
          <ClusterAboutCard />
        </GridItem>
        <GridItem xs={12}>
          <ClusterPolicyComplianceCard />
        </GridItem>
        <GridItem xs={12}>
          <ClusterLabelsCard />
        </GridItem>
        <GridItem xs={12}>
          <ClusterAnnotationsCard />
        </GridItem>
      </GridItem>
    </GridItem>

    {/* Right column section */}
    <GridItem md={6} xs={12}>
      <GridItem container spacing={3}>
        <GridItem xs={12}>
          <ClusterToolsCard />
        </GridItem>
        <GridItem xs={12}>
          <ClusterGitOpsCard />
        </GridItem>
        <GridItem xs={12}>
          <ClusterFluxStatusCard />
        </GridItem>
        <GridItem xs={12}>
          <ClusterAccessCard />
        </GridItem>
      </GridItem>
    </GridItem>
  </Grid>
);
