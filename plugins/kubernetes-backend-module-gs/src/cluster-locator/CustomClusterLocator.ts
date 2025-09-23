import { BackstageCredentials } from '@backstage/backend-plugin-api';
import {
  ClusterDetails,
  KubernetesClustersSupplier,
} from '@backstage/plugin-kubernetes-node';
import { Duration } from 'luxon';
import { runPeriodically } from '../utils/runPeriodically';
import {
  ANNOTATION_KUBERNETES_AUTH_PROVIDER,
  ANNOTATION_KUBERNETES_OIDC_TOKEN_PROVIDER,
} from '@backstage/plugin-kubernetes-common';
import { GSService } from '@giantswarm/backstage-plugin-gs-node';

export class CustomClusterLocator implements KubernetesClustersSupplier {
  constructor(private gsService: GSService) {}

  static create(
    gsService: GSService,
    refreshInterval: Duration = Duration.fromObject({ minutes: 1 }),
  ) {
    const clusterSupplier = new CustomClusterLocator(gsService);
    runPeriodically(() => {
      clusterSupplier.refreshClusters();
    }, refreshInterval.toMillis());

    return clusterSupplier;
  }

  async refreshClusters(): Promise<void> {}

  async getClusters(options: {
    credentials: BackstageCredentials;
  }): Promise<ClusterDetails[]> {
    const clusters = await this.gsService.getClusters(options);

    return clusters.map(cluster => ({
      name: cluster.name,
      url: cluster.url,
      skipTLSVerify: true,
      authMetadata: {
        [ANNOTATION_KUBERNETES_AUTH_PROVIDER]: cluster.authProvider,
        [ANNOTATION_KUBERNETES_OIDC_TOKEN_PROVIDER]: cluster.oidcTokenProvider,
      },
    }));
  }
}
