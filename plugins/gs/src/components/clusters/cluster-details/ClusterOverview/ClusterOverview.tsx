import { useEffect } from 'react';
import { Grid } from '@material-ui/core';
import { ClusterAboutCard } from './ClusterAboutCard';
import { useErrors } from '../../../Errors';
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

export const ClusterOverview = () => {
  const { cluster, installationName } = useCurrentCluster();
  const { showError } = useErrors();
  const hasClusterApp = hasClusterAppLabel(cluster);
  const clusterAppName = getClusterName(cluster);
  const clusterAppNamespace = getClusterNamespace(cluster);
  const {
    data: clusterApp,
    error: clusterAppError,
    queryKey: clusterAppQueryKey,
    queryErrorMessage: clusterAppQueryErrorMessage,
    refetch: clusterAppRefetch,
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

  useEffect(() => {
    if (!clusterAppError) return;

    showError(clusterAppError, {
      queryKey: clusterAppQueryKey,
      message: clusterAppQueryErrorMessage,
      retry: clusterAppRefetch,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterAppError]);

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
          <Grid item xs={12}>
            <ClusterLabelsCard />
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
    </Grid>
  );
};
