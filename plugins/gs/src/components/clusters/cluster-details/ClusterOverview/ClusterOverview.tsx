import { Grid } from '@material-ui/core';
import { ClusterAboutCard } from './ClusterAboutCard';
import { ClusterAccessCard } from './ClusterAccessCard';
import { ClusterPolicyComplianceCard } from './ClusterPolicyComplianceCard';
import { ClusterLabelsCard } from './ClusterLabelsCard';
import { ClusterToolsCard } from './ClusterToolsCard';
import { useResource } from '../../../hooks';
import { useCurrentCluster } from '../../ClusterDetailsPage/useCurrentCluster';
import {
  App,
  AppKind,
  getClusterName,
  getClusterNamespace,
  hasClusterAppLabel,
  isAppManagedByFlux,
} from '@giantswarm/backstage-plugin-gs-common';
import { GitOpsCard } from '../../../GitOpsCard';
import { useShowErrors } from '../../../Errors/useErrors';
import { ClusterAnnotationsCard } from './ClusterAnnotationsCard';

export const ClusterOverview = () => {
  const { cluster, installationName } = useCurrentCluster();
  const hasClusterApp = hasClusterAppLabel(cluster);
  const clusterAppName = getClusterName(cluster);
  const clusterAppNamespace = getClusterNamespace(cluster);
  const {
    data: clusterApp,
    errors: clusterAppErrors,
    queryErrorMessage: clusterAppQueryErrorMessage,
  } = useResource<App>(
    {
      kind: AppKind,
      installationName,
      name: clusterAppName!,
      namespace: clusterAppNamespace,
    },
    {
      enabled: hasClusterApp,
    },
  );

  useShowErrors(clusterAppErrors, {
    message: clusterAppQueryErrorMessage,
  });

  const isGitOpsManaged = clusterApp && isAppManagedByFlux(clusterApp);

  return (
    <Grid container spacing={3} alignItems="stretch">
      <Grid item md={6} xs={12}>
        <Grid item container spacing={3}>
          <Grid item xs={12}>
            <ClusterAboutCard />
          </Grid>
          <Grid item xs={12}>
            <ClusterPolicyComplianceCard />
          </Grid>
        </Grid>
      </Grid>
      <Grid item md={6} xs={12}>
        <Grid item container spacing={3}>
          <Grid item xs={12}>
            <ClusterToolsCard />
          </Grid>
          {isGitOpsManaged && (
            <Grid item xs={12}>
              <GitOpsCard
                deployment={clusterApp}
                installationName={installationName}
              />
            </Grid>
          )}
          <Grid item xs={12}>
            <ClusterAccessCard />
          </Grid>
        </Grid>
      </Grid>
      <Grid item xs={12}>
        <Grid item container spacing={3}>
          <Grid item xs={6}>
            <ClusterLabelsCard />
          </Grid>
          <Grid item xs={6}>
            <ClusterAnnotationsCard />
          </Grid>
        </Grid>
      </Grid>
    </Grid>
  );
};
