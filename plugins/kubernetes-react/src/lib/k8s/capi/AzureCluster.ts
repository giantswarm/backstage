import { crds } from '@giantswarm/k8s-types';
import { ProviderCluster } from './ProviderCluster';

type AzureClusterInterface = crds.capz.v1beta1.AzureCluster;

export class AzureCluster extends ProviderCluster<AzureClusterInterface> {
  static apiVersion = 'v1beta1';
  static group = 'infrastructure.cluster.x-k8s.io';
  static kind = 'AzureCluster' as const;
  static plural = 'azureclusters';

  getLocation() {
    return this.jsonData.spec?.location;
  }
}
