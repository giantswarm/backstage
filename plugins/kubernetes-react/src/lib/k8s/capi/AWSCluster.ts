import { crds } from '@giantswarm/k8s-types';
import { ProviderCluster } from './ProviderCluster';

type AWSClusterInterface = crds.capa.v1beta2.AWSCluster;

export class AWSCluster extends ProviderCluster<AWSClusterInterface> {
  static apiVersion = 'v1beta2';
  static group = 'infrastructure.cluster.x-k8s.io';
  static kind = 'AWSCluster' as const;
  static plural = 'awsclusters';

  getLocation() {
    return this.jsonData.spec?.region;
  }
}
