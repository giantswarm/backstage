import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { isAwaitingData } from '@giantswarm/backstage-plugin-ui-react';

import { ClusterManagerClient } from '../apis/ClusterManagerClient';
import { SIZING_POOL_NAME } from '../components/GpuNodePools/AddGpuNodePoolPage';
import { cacheKeptByCluster, type InstanceShape } from '../lib/clusterManager';
import { poolPriceOf, type PoolPrice } from '../lib/poolPricing';
import type { GpuNodePoolRow } from './useClusterManager';
import { useMusterPluginApi } from './useMusterPluginApi';

/** The prices change with AWS's list, not by the minute. */
const PRICE_STALE_MS = 60 * 60_000;

/** One sizing read per cluster and accelerator: pools sharing both share the sizes. */
export function sizingKeyOf(row: GpuNodePoolRow): string {
  return `${row.installation}/${row.cluster.name}/${row.pool.accelerator ?? ''}`;
}

export type NodeSizePrices = {
  /** The pool's price, once its sizes were read and one of them is priced. */
  priceOf: (row: GpuNodePoolRow) => PoolPrice | undefined;
  /** Whether the pool's sizes are still being read. */
  isReading: (row: GpuNodePoolRow) => boolean;
  /** Any pool's sizes still being read. */
  isLoading: boolean;
};

/**
 * The on-demand price per hour of the node sizes the GPU pools run, as
 * cluster-manager lists it: the same `sizes[].pricePerHourUSD` the Add GPU
 * node pool form shows per size. `list_node_pools` carries no price, so the
 * sizes are read the way that form reads them — `create_node_pool` as a dry
 * run (nothing is written) with the chart's defaults for the pool's cluster
 * and accelerator — once per cluster and accelerator, kept for an hour.
 *
 * A read that fails, or an older cluster-manager that prices nothing, leaves
 * the pool without a price: shown as absent, never estimated.
 */
export function useNodeSizePrices(rows: GpuNodePoolRow[]): NodeSizePrices {
  const musterApi = useMusterPluginApi();
  const targets = useMemo(() => {
    const byKey = new Map<string, GpuNodePoolRow>();
    for (const row of rows) {
      if (row.pool.accelerator && !byKey.has(sizingKeyOf(row))) {
        byKey.set(sizingKeyOf(row), row);
      }
    }
    return [...byKey.entries()];
  }, [rows]);

  const queries = useQueries({
    queries: targets.map(([key, row]) => ({
      queryKey: ['muster', 'agent-platform', 'node-size-prices', key] as const,
      enabled: Boolean(musterApi),
      queryFn: async (): Promise<InstanceShape[]> => {
        const client = new ClusterManagerClient(musterApi!, row.installation);
        const result = await client.createNodePool(
          {
            cluster: row.cluster.name,
            namespace: row.cluster.namespace,
            name: SIZING_POOL_NAME,
            accelerator: row.pool.accelerator,
            // A cluster that keeps a model cache refuses `cache: false`, the
            // tool's default.
            ...(cacheKeptByCluster(row.cluster) ? { cache: true } : {}),
          },
          { dryRun: true },
        );
        return result.sizes ?? [];
      },
      staleTime: PRICE_STALE_MS,
      retry: false,
    })),
  });

  const signature = queries
    .map(query => `${query.dataUpdatedAt}:${query.status}`)
    .join('|');
  return useMemo(() => {
    const shapesByKey = new Map<string, InstanceShape[]>();
    const readingKeys = new Set<string>();
    targets.forEach(([key], index) => {
      const query = queries[index];
      if (query?.data) {
        shapesByKey.set(key, query.data);
      } else if (query && isAwaitingData(query)) {
        readingKeys.add(key);
      }
    });
    return {
      priceOf: row => {
        const shapes = shapesByKey.get(sizingKeyOf(row));
        return shapes ? poolPriceOf(row.pool, shapes) : undefined;
      },
      isReading: row => Boolean(musterApi) && readingKeys.has(sizingKeyOf(row)),
      isLoading: Boolean(musterApi) && readingKeys.size > 0,
    };
    // `queries` is a fresh array every render; `signature` is what changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets, signature, musterApi]);
}
