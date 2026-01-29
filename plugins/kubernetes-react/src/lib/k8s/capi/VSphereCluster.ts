import { crds } from '@giantswarm/k8s-types';
import { ProviderCluster } from './ProviderCluster';

type VSphereClusterInterface = crds.capv.v1beta1.VSphereCluster;

export class VSphereCluster extends ProviderCluster<VSphereClusterInterface> {
  static readonly supportedVersions = ['v1beta1'] as const;
  static readonly group = 'infrastructure.cluster.x-k8s.io';
  static readonly kind = 'VSphereCluster' as const;
  static readonly plural = 'vsphereclusters';
}
