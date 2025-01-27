import * as v1beta1 from './v1beta1';

export const AzureClusterKind = 'AzureCluster';
export const AzureClusterApiGroup = 'infrastructure.cluster.x-k8s.io';
export const AzureClusterNames = {
  plural: 'azureclusters',
  singular: 'azurecluster',
};

export function getAzureClusterGVK(apiVersion?: string) {
  if (!apiVersion) {
    return v1beta1.AzureClusterGVK;
  }

  switch (apiVersion) {
    case v1beta1.AzureClusterApiVersion:
      return v1beta1.AzureClusterGVK;
    default:
      return undefined;
  }
}

export const AzureClusterIdentityKind = 'AzureClusterIdentity';

export function getAzureClusterIdentityGVK(apiVersion?: string) {
  if (!apiVersion) {
    return v1beta1.AzureClusterIdentityGVK;
  }

  switch (apiVersion) {
    case v1beta1.AzureClusterIdentityApiVersion:
      return v1beta1.AzureClusterIdentityGVK;
    default:
      return undefined;
  }
}
