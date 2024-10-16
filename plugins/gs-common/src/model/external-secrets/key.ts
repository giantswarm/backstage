import * as v1beta1 from './v1beta1';

export const SecretStoreKind = 'SecretStore';
export const SecretStoreApiGroup = 'external-secrets.io';
export const SecretStoreNames = {
  plural: 'secretstores',
  singular: 'secretstore',
};

export function getSecretStoreGVK(apiVersion?: string) {
  if (!apiVersion) {
    return v1beta1.SecretStoreGVK;
  }

  switch (apiVersion) {
    case v1beta1.SecretStoreApiVersion:
      return v1beta1.SecretStoreGVK;
    default:
      return undefined;
  }
}

export const ClusterSecretStoreKind = 'SecretStore';
export const ClusterSecretStoreApiGroup = 'external-secrets.io';
export const ClusterSecretStoreNames = {
  plural: 'clustersecretstores',
  singular: 'clustersecretstore',
};

export function getClusterSecretStoreGVK(apiVersion?: string) {
  if (!apiVersion) {
    return v1beta1.ClusterSecretStoreGVK;
  }

  switch (apiVersion) {
    case v1beta1.ClusterSecretStoreApiVersion:
      return v1beta1.ClusterSecretStoreGVK;
    default:
      return undefined;
  }
}
