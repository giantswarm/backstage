import { crds } from '@giantswarm/k8s-types';
import { ProviderCluster } from './ProviderCluster';

type VCDClusterInterface = crds.capvcd.v1beta3.VCDCluster;

export class VCDCluster extends ProviderCluster<VCDClusterInterface> {
  static readonly supportedVersions = ['v1beta3'] as const;
  static readonly group = 'infrastructure.cluster.x-k8s.io';
  static readonly kind = 'VCDCluster' as const;
  static readonly plural = 'vcdclusters';
}
