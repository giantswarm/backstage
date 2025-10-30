import { crds } from '@giantswarm/k8s-types';
import { ProviderCluster } from './ProviderCluster';

type VCDClusterInterface = crds.capvcd.v1beta3.VCDCluster;

export class VCDCluster extends ProviderCluster<VCDClusterInterface> {
  static apiVersion = 'v1beta3';
  static group = 'infrastructure.cluster.x-k8s.io';
  static kind = 'VCDCluster' as const;
  static plural = 'vcdclusters';
}
