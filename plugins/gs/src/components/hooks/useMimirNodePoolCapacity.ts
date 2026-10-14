import { useCallback, useMemo } from 'react';
import {
  UseQueryResult,
  keepPreviousData,
  useQueries,
} from '@tanstack/react-query';
import { isAwaitingData } from '@giantswarm/backstage-plugin-ui-react';
import { MimirMetricSample } from '../../apis/mimir';
import {
  KubeNodeLabels,
  KubeNodeStatusCapacity,
  KubeNodeStatusCondition,
} from '../../apis/mimir/metrics';
import { NodePoolMetrics } from '../clusters/nodePools';
import { mimirQueryRetry } from './mimirRetry';
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

/**
 * Pool capacities by cluster id, with an entry for each of `clusterIds`, so a
 * cluster absent from the result was not part of the query. A pool without
 * all three series is absent. Plain objects, as the query cache is persisted
 * as JSON.
 */
export function parseNodePoolCapacity(
  samples: MimirMetricSample[],
  clusterIds: string[],
): Record<string, NodePoolMetrics> {
  const partial: Record<string, Record<string, PoolSample>> = {};
  for (const clusterId of clusterIds) {
    partial[clusterId] = {};
  }

  for (const { metric, value } of samples) {
    const amount = Number(value[1]);
    const field = RESOURCE_FIELDS[metric.resource];
    const pools = partial[metric.cluster_id];
    if (!pools || !metric.nodepool || !field || !Number.isFinite(amount)) {
      continue;
    }

    pools[metric.nodepool] = { ...pools[metric.nodepool], [field]: amount };
  }

  const result: Record<string, NodePoolMetrics> = {};
  for (const [clusterId, pools] of Object.entries(partial)) {
    const complete: Record<
      string,
      { nodes: number; vcpus: number; memoryBytes: number }
    > = {};
    for (const [name, { nodes, vcpus, memoryBytes }] of Object.entries(pools)) {
      if (
        nodes !== undefined &&
        vcpus !== undefined &&
        memoryBytes !== undefined
      ) {
        complete[name] = { nodes, vcpus, memoryBytes };
      }
    }
    result[clusterId] = complete;
  }
  return result;
}

export type NodePoolMetricsStatus = 'loading' | 'ok' | 'unavailable' | 'error';

export type InstallationNodePoolMetrics = {
  status: NodePoolMetricsStatus;
  /**
   * By cluster id; set when `status` is `ok`. While the installation's set of
   * clusters changes, this is the previous answer, without the clusters it
   * did not ask for.
   */
  clusters?: Readonly<Record<string, NodePoolMetrics>>;
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
    (results: UseQueryResult<Record<string, NodePoolMetrics>>[]) => {
      const byInstallation = new Map<string, InstallationNodePoolMetrics>();
      for (const installationName of requested) {
        byInstallation.set(installationName, {
          status: isLoadingConfig ? 'loading' : 'unavailable',
        });
      }
      withMimir.forEach((installationName, index) => {
        const result = results[index];
        const { data, error } = result;
        let status: NodePoolMetricsStatus = 'ok';
        if (isAwaitingData(result)) {
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
      const clusterIds = [...clusterIdsByInstallation[installationName]].sort();
      const query = buildNodePoolCapacityQuery(clusterIds);
      return {
        queryKey: ['mimir-node-pool-capacity', installationName, query],
        queryFn: async () => {
          const response = await queryMimir(installationName, query);
          return parseNodePoolCapacity(response.data?.result ?? [], clusterIds);
        },
        // The key holds the installation's cluster ids, so it changes as
        // clusters come and go; the clusters already answered stay shown.
        placeholderData: keepPreviousData,
        staleTime: 30_000,
        retry: mimirQueryRetry,
      };
    }),
    combine,
  });
}
