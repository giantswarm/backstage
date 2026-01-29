import { crds } from '@giantswarm/k8s-types';
import { ProviderCluster } from './ProviderCluster';

type AWSClusterInterface = crds.capa.v1beta2.AWSCluster;

export class AWSCluster extends ProviderCluster<AWSClusterInterface> {
  static readonly supportedVersions = ['v1beta2'] as const;
  static readonly group = 'infrastructure.cluster.x-k8s.io';
  static readonly kind = 'AWSCluster' as const;
  static readonly plural = 'awsclusters';

  getLocation() {
    return this.jsonData.spec?.region;
  }
}
