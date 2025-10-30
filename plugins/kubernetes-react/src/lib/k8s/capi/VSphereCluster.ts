import { crds } from '@giantswarm/k8s-types';
import { ProviderCluster } from './ProviderCluster';

type VSphereClusterInterface = crds.capv.v1beta1.VSphereCluster;

export class VSphereCluster extends ProviderCluster<VSphereClusterInterface> {
  static apiVersion = 'v1beta1';
  static group = 'infrastructure.cluster.x-k8s.io';
  static kind = 'VSphereCluster' as const;
  static plural = 'vsphereclusters';
}
