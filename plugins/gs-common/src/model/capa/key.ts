import * as v1beta1 from './v1beta1';
import * as v1beta2 from './v1beta2';

export const AWSClusterKind = 'AWSCluster';
export const AWSClusterApiGroup = 'infrastructure.cluster.x-k8s.io';
export const AWSClusterNames = {
  plural: 'awsclusters',
  singular: 'awscluster',
};

export function getAWSClusterGVK(apiVersion?: string) {
  if (!apiVersion) {
    return v1beta2.AWSClusterGVK;
  }

  switch (apiVersion) {
    case v1beta1.AWSClusterApiVersion:
      return v1beta1.AWSClusterGVK;
    case v1beta2.AWSClusterApiVersion:
      return v1beta2.AWSClusterGVK;
    default:
      return undefined;
  }
}
