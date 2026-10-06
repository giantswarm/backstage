import { useCallback, useMemo } from 'react';
import { UseQueryResult, useQueries } from '@tanstack/react-query';
import { MimirMetricSample } from '../../apis/mimir';
import {
  KubeNodeLabels,
  KubeNodeStatusCapacity,
  KubeNodeStatusCondition,
} from '../../apis/mimir/metrics';
import { MachineSize, NodePoolMetrics } from '../clusters/nodePools';
import { sanitizePromQLValue } from './promql';
import { useMimirInstallations } from './useMimirInstallations';
import { useMimirQueryFn } from './useMimirQueryFn';

/**
 * Per-pool CPU and memory capacity of the Ready nodes of the given clusters.
 * Nodes join their pool through the `nodepool` label on `kube_node_labels`,
 * which carries the MachinePool or MachineDeployment name.
 */
export function buildNodePoolCapacityQuery(clusterIds: string[]): string {
  const ids = clusterIds.map(sanitizePromQLValue).join('|');
  const clusters = `cluster_id=~"${ids}"`;

  return [
    'sum by (cluster_id, nodepool, resource) (',
    `  max by (cluster_id, node, resource) (${KubeNodeStatusCapacity.name}{${clusters}, resource=~"cpu|memory"})`,
    '  * on (cluster_id, node) group_left (nodepool)',
    `    max by (cluster_id, node, nodepool) (${KubeNodeLabels.name}{${clusters}, nodepool!=""})`,
    '  * on (cluster_id, node) group_left ()',
    `    max by (cluster_id, node) (${KubeNodeStatusCondition.name}{${clusters}, condition="Ready", status="true"} == 1)`,
    ')',
  ].join(' ');
}

/** Pool capacities by cluster id. A pool without series is absent. */
export function parseNodePoolCapacity(
  samples: MimirMetricSample[],
): Map<string, NodePoolMetrics> {
  const partial = new Map<string, Map<string, Partial<MachineSize>>>();

  for (const { metric, value } of samples) {
    const amount = Number(value[1]);
    if (!metric.cluster_id || !metric.nodepool || !Number.isFinite(amount)) {
      continue;
    }

    let pools = partial.get(metric.cluster_id);
    if (!pools) {
      pools = new Map();
      partial.set(metric.cluster_id, pools);
    }
    const pool = pools.get(metric.nodepool) ?? {};
    if (metric.resource === 'cpu') {
      pool.vcpus = amount;
    } else if (metric.resource === 'memory') {
      pool.memoryBytes = amount;
    }
    pools.set(metric.nodepool, pool);
  }

  const result = new Map<string, NodePoolMetrics>();
  for (const [clusterId, pools] of partial) {
    const complete = new Map<string, MachineSize>();
    for (const [name, { vcpus, memoryBytes }] of pools) {
      if (vcpus !== undefined && memoryBytes !== undefined) {
        complete.set(name, { vcpus, memoryBytes });
      }
    }
    result.set(clusterId, complete);
  }
  return result;
}

export type NodePoolMetricsStatus = 'loading' | 'ok' | 'unavailable' | 'error';

export type InstallationNodePoolMetrics = {
  status: NodePoolMetricsStatus;
  /** By cluster id; set when `status` is `ok`. */
  clusters?: Map<string, NodePoolMetrics>;
};

/**
 * Node pool capacity from Mimir for the given clusters, one query per
 * installation. Installations without Mimir report `unavailable`.
 */
export function useMimirNodePoolCapacity(
  clusterIdsByInstallation: Record<string, string[]>,
): Map<string, InstallationNodePoolMetrics> {
  const queryMimir = useMimirQueryFn();

  const requested = useMemo(
    () => Object.keys(clusterIdsByInstallation).sort(),
    [clusterIdsByInstallation],
  );
  const { installations: withMimir, isLoading: isLoadingConfig } =
    useMimirInstallations(requested);

  const combine = useCallback(
    (results: UseQueryResult<Map<string, NodePoolMetrics>>[]) => {
      const byInstallation = new Map<string, InstallationNodePoolMetrics>();
      for (const installationName of requested) {
        byInstallation.set(installationName, {
          status: isLoadingConfig ? 'loading' : 'unavailable',
        });
      }
      withMimir.forEach((installationName, index) => {
        const { data, isLoading, error } = results[index];
        let status: NodePoolMetricsStatus = 'ok';
        if (isLoading) {
          status = 'loading';
        } else if (error || !data) {
          status = 'error';
        }
        byInstallation.set(installationName, { status, clusters: data });
      });
      return byInstallation;
    },
    [requested, withMimir, isLoadingConfig],
  );

  return useQueries({
    queries: withMimir.map(installationName => {
      const query = buildNodePoolCapacityQuery(
        [...clusterIdsByInstallation[installationName]].sort(),
      );
      return {
        queryKey: ['mimir-node-pool-capacity', installationName, query],
        queryFn: async () => {
          const response = await queryMimir(installationName, query);
          return parseNodePoolCapacity(response.data?.result ?? []);
        },
        staleTime: 30_000,
      };
    }),
    combine,
  });
}
