import * as v1beta3 from './v1beta3';

export const VCDClusterKind = 'VCDCluster';
export const VCDClusterApiGroup = 'infrastructure.cluster.x-k8s.io';
export const VCDClusterNames = {
  plural: 'vcdclusters',
  singular: 'vcdcluster',
};

export function getVCDClusterGVK(apiVersion?: string) {
  if (!apiVersion) {
    return v1beta3.VCDClusterGVK;
  }

  switch (apiVersion) {
    case v1beta3.VCDClusterApiVersion:
      return v1beta3.VCDClusterGVK;
    default:
      return undefined;
  }
}
