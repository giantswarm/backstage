import * as v1beta1 from './v1beta1';

export const VSphereClusterKind = 'VSphereCluster';
export const VSphereClusterApiGroup = 'infrastructure.cluster.x-k8s.io';
export const VSphereClusterNames = {
  plural: 'vsphereclusters',
  singular: 'vspherecluster',
};

export function getVSphereClusterGVK(apiVersion?: string) {
  if (!apiVersion) {
    return v1beta1.VSphereClusterGVK;
  }

  switch (apiVersion) {
    case v1beta1.VSphereClusterApiVersion:
      return v1beta1.VSphereClusterGVK;
    default:
      return undefined;
  }
}

export const VSphereClusterIdentityKind = 'VSphereClusterIdentity';

export function getVSphereClusterIdentityGVK(apiVersion?: string) {
  if (!apiVersion) {
    return v1beta1.VSphereClusterIdentityGVK;
  }

  switch (apiVersion) {
    case v1beta1.VSphereClusterIdentityApiVersion:
      return v1beta1.VSphereClusterIdentityGVK;
    default:
      return undefined;
  }
}
