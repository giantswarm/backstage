import { useCallback, useMemo } from 'react';
import { UseQueryResult, useQueries } from '@tanstack/react-query';
import { MimirMetricSample } from '../../apis/mimir';
import {
  KubeNodeLabels,
  KubeNodeStatusCapacity,
  KubeNodeStatusCondition,
} from '../../apis/mimir/metrics';
import { NodePoolMetrics } from '../clusters/nodePools';
import { sanitizePromQLValue } from './promql';
import { useMimirInstallations } from './useMimirInstallations';
import { useMimirQueryFn } from './useMimirQueryFn';

/**
 * Per-pool Ready node count and CPU and memory capacity of the given
 * clusters. Nodes join their pool through the `nodepool` label on
 * `kube_node_labels`, which carries the MachinePool or MachineDeployment
 * name.
 */
export function buildNodePoolCapacityQuery(clusterIds: string[]): string {
  const ids = clusterIds.map(sanitizePromQLValue).join('|');
  const clusters = `cluster_id=~"${ids}"`;
  const readyPoolNodes = [
    `max by (cluster_id, node, nodepool) (${KubeNodeLabels.name}{${clusters}, nodepool!=""})`,
    '* on (cluster_id, node) group_left ()',
    `max by (cluster_id, node) (${KubeNodeStatusCondition.name}{${clusters}, condition="Ready", status="true"} == 1)`,
  ].join(' ');

  return [
    'sum by (cluster_id, nodepool, resource) (',
    `  max by (cluster_id, node, resource) (${KubeNodeStatusCapacity.name}{${clusters}, resource=~"cpu|memory"})`,
    `  * on (cluster_id, node) group_left (nodepool) (${readyPoolNodes})`,
    ')',
    `or label_replace(count by (cluster_id, nodepool) (${readyPoolNodes}), "resource", "nodes", "", "")`,
  ].join(' ');
}

type PoolSample = { nodes?: number; vcpus?: number; memoryBytes?: number };

const RESOURCE_FIELDS: Record<string, keyof PoolSample> = {
  nodes: 'nodes',
  cpu: 'vcpus',
  memory: 'memoryBytes',
};

/** Pool capacities by cluster id. A pool without all three series is absent. */
export function parseNodePoolCapacity(
  samples: MimirMetricSample[],
): Map<string, NodePoolMetrics> {
  const partial = new Map<string, Map<string, PoolSample>>();

  for (const { metric, value } of samples) {
    const amount = Number(value[1]);
    const field = RESOURCE_FIELDS[metric.resource];
    if (
      !metric.cluster_id ||
      !metric.nodepool ||
      !field ||
      !Number.isFinite(amount)
    ) {
      continue;
    }

    let pools = partial.get(metric.cluster_id);
    if (!pools) {
      pools = new Map();
      partial.set(metric.cluster_id, pools);
    }
    pools.set(metric.nodepool, {
      ...pools.get(metric.nodepool),
      [field]: amount,
    });
  }

  const result = new Map<string, NodePoolMetrics>();
  for (const [clusterId, pools] of partial) {
    const complete = new Map<
      string,
      { nodes: number; vcpus: number; memoryBytes: number }
    >();
    for (const [name, { nodes, vcpus, memoryBytes }] of pools) {
      if (
        nodes !== undefined &&
        vcpus !== undefined &&
        memoryBytes !== undefined
      ) {
        complete.set(name, { nodes, vcpus, memoryBytes });
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
