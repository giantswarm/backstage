import type { ClusterSecretStore } from '@internal/plugin-gs-common';
import { clusterSecretStoreGVK } from '@internal/plugin-gs-common';
import { useListResources } from './useListResources';

export function useClusterSecretStores(installations?: string[]) {
  return useListResources<ClusterSecretStore>(
    clusterSecretStoreGVK,
    installations,
  );
}
