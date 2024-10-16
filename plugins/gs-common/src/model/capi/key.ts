import * as v1beta1 from './v1beta1';

export const ClusterKind = 'Cluster';
export const ClusterApiGroup = 'cluster.x-k8s.io';
export const ClusterNames = {
  plural: 'clusters',
  singular: 'cluster',
};

export function getClusterGVK(apiVersion?: string) {
  if (!apiVersion) {
    return v1beta1.ClusterGVK;
  }

  switch (apiVersion) {
    case v1beta1.ClusterApiVersion:
      return v1beta1.ClusterGVK;
    default:
      return undefined;
  }
}

export const KubeadmControlPlaneKind = 'KubeadmControlPlane';
export const KubeadmControlPlaneApiGroup = 'controlplane.cluster.x-k8s.io';
export const KubeadmControlPlaneNames = {
  plural: 'kubeadmcontrolplanes',
  singular: 'kubeadmcontrolplane',
};

export function getKubeadmControlPlaneGVK(apiVersion?: string) {
  if (!apiVersion) {
    return v1beta1.KubeadmControlPlaneGVK;
  }

  switch (apiVersion) {
    case v1beta1.KubeadmControlPlaneApiVersion:
      return v1beta1.KubeadmControlPlaneGVK;
    default:
      return undefined;
  }
}
