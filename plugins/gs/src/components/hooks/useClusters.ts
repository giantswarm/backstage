import type { Cluster } from '@internal/plugin-gs-common';
import { clusterGVK } from '@internal/plugin-gs-common';
import { useListResources } from './useListResources';

export function useClusters() {
  return useListResources<Cluster>(clusterGVK);
}
