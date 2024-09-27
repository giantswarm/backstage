import type { ClusterSecretStore } from '@giantswarm/backstage-plugin-gs-common';
import { clusterSecretStoreGVK } from '@giantswarm/backstage-plugin-gs-common';
import { useListResources } from './useListResources';

export function useClusterSecretStores(installations?: string[]) {
  return useListResources<ClusterSecretStore>(
    clusterSecretStoreGVK,
    installations,
  );
}
