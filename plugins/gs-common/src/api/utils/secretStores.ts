import * as secretsv1beta1 from '../../model/secretsv1beta1';
import type { SecretStore, ClusterSecretStore } from '../types';

export const secretStoreGVK = [secretsv1beta1.secretStoreGVK];
export const clusterSecretStoreGVK = [secretsv1beta1.clusterSecretStoreGVK];

export function getSecretStoreName(
  secretStore: SecretStore | ClusterSecretStore,
) {
  return secretStore.metadata.name;
}
