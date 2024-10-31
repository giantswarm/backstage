import * as externalSecrets from '../../model/external-secrets';
import type { SecretStore, ClusterSecretStore } from '../types';

export function getSecretStoreNames() {
  return externalSecrets.SecretStoreNames;
}

export function getSecretStoreGVK(apiVersion?: string) {
  const gvk = externalSecrets.getSecretStoreGVK(apiVersion);
  const kind = externalSecrets.SecretStoreKind;

  if (!gvk) {
    throw new Error(
      `${apiVersion} API version is not supported for ${kind} resource.`,
    );
  }

  return gvk;
}

export function getClusterSecretStoreNames() {
  return externalSecrets.ClusterSecretStoreNames;
}

export function getClusterSecretStoreGVK(apiVersion?: string) {
  const gvk = externalSecrets.getClusterSecretStoreGVK(apiVersion);

  if (!gvk) {
    throw new Error(
      `${apiVersion} API version is not supported for ClusterSecretStore resource.`,
    );
  }

  return gvk;
}

export function getSecretStoreName(
  secretStore: SecretStore | ClusterSecretStore,
) {
  return secretStore.metadata.name;
}
