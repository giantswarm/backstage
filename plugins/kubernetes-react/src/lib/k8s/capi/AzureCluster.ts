import { crds } from '@giantswarm/k8s-types';
import { ProviderCluster } from './ProviderCluster';

type AzureClusterInterface = crds.capz.v1beta1.AzureCluster;

export class AzureCluster extends ProviderCluster<AzureClusterInterface> {
  static readonly supportedVersions = ['v1beta1'] as const;
  static readonly group = 'infrastructure.cluster.x-k8s.io';
  static readonly kind = 'AzureCluster' as const;
  static readonly plural = 'azureclusters';

  getLocation() {
    return this.jsonData.spec?.location;
  }
}
