import { useCallback, useMemo, useState } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';

import { ClusterManagerClient } from '../apis/ClusterManagerClient';
import {
  CLUSTER_MANAGER_SERVER,
  ClusterManagerNotConnectedError,
  clusterApiNote,
  isManagedPool,
  parseReplicasGuard,
  poolNameOf,
  type ClusterManagerInfo,
  type CreateNodePoolInput,
  type DeleteNodePoolInput,
  type ManagedCluster,
  type NodePool,
  type NodePoolWriteResult,
  type ReplicasGuard,
  type WriteMode,
} from '../lib/clusterManager';
import { gpuNodePoolsRefetchInterval } from '../lib/poolLifecycle';
import {
  musterAcceleratorsQueryKey,
  musterClusterManagerInfoQueryKey,
  musterClustersQueryKey,
} from '../lib/queryKeys';
import { useMusterPluginApi } from './useMusterPluginApi';
import {
  useMusterServerAvailability,
  type MusterServerAvailability,
} from './useMusterServerAvailability';

/**
 * cluster-manager's tools on one installation, as the signed-in person —
 * `undefined` without the muster plugin or without an installation.
 */
export function useClusterManagerClient(
  installation: string | undefined,
): ClusterManagerClient | undefined {
  const musterApi = useMusterPluginApi();
  return useMemo(
    () =>
      musterApi && installation
        ? new ClusterManagerClient(musterApi, installation)
        : undefined,
    [musterApi, installation],
  );
}

/** The installations whose muster registers cluster-manager. */
export function useClusterManagerAvailability(
  installations: string[],
): MusterServerAvailability {
  return useMusterServerAvailability(CLUSTER_MANAGER_SERVER, installations);
}

export type ClusterManagerInfoState = {
  info: ClusterManagerInfo | undefined;
  isLoading: boolean;
  error: Error | null;
};

/** `get_info`: the write modes this installation's cluster-manager offers. */
export function useClusterManagerInfo(
  installation: string | undefined,
): ClusterManagerInfoState {
  const client = useClusterManagerClient(installation);
  const { data, isLoading, error } = useQuery({
    queryKey: musterClusterManagerInfoQueryKey(installation ?? ''),
    enabled: Boolean(client),
    queryFn: () => client!.getInfo(),
    staleTime: 60_000,
    retry: false,
  });
  return {
    info: data,
    isLoading: Boolean(client) && isLoading,
    error: (error as Error) ?? null,
  };
}

/**
 * `list_clusters` on one installation, with the marks the tool reports —
 * and, where the installation does not serve the Cluster API, the tool's note
 * saying so (the list is empty then, not failed).
 */
export function useManagedClusters(installation: string | undefined) {
  const client = useClusterManagerClient(installation);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: musterClustersQueryKey(installation ?? ''),
    enabled: Boolean(client),
    queryFn: () => client!.listClusters(),
    staleTime: 30_000,
    retry: false,
  });
  return {
    clusters: data?.clusters ?? [],
    clusterApiNote: clusterApiNote(data?.clusterApi),
    isLoading: Boolean(client) && isLoading,
    error: (error as Error) ?? null,
    refetch,
  };
}

/** The curated accelerators for the create dialog. */
export function useAccelerators(installation: string | undefined) {
  const client = useClusterManagerClient(installation);
  const { data } = useQuery({
    queryKey: musterAcceleratorsQueryKey(installation ?? ''),
    enabled: Boolean(client),
    queryFn: () => client!.listAccelerators(),
    staleTime: 5 * 60_000,
    retry: false,
  });
  return data;
}

/** One GPU node pool cluster-manager owns, as a row of the pools list. */
export type GpuNodePoolRow = {
  /** `<installation>/<cluster>/<pool>`, the table's row key. */
  id: string;
  installation: string;
  cluster: ManagedCluster;
  /** The pool name as given to `create_node_pool`. */
  poolName: string;
  pool: NodePool;
};

/** What one installation's `list_clusters` → `list_node_pools` fan-out yields. */
type GpuNodePoolsOfInstallation = {
  rows: GpuNodePoolRow[];
  /** The tool's note where the installation does not serve the Cluster API. */
  note?: string;
};

/**
 * Every GPU node pool cluster-manager owns across the installations that have
 * it: `list_clusters`, then `list_node_pools` for each cluster with a pool
 * release. One query per installation, all through the person's session. An
 * installation without the Cluster API contributes no rows and its note.
 */
export function useGpuNodePools(installations: string[]) {
  const musterApi = useMusterPluginApi();
  const queries = useQueries({
    queries: installations.map(installation => ({
      queryKey: [...musterClustersQueryKey(installation), 'pools'] as const,
      enabled: Boolean(musterApi),
      queryFn: async (): Promise<GpuNodePoolsOfInstallation> => {
        const client = new ClusterManagerClient(musterApi!, installation);
        const { clusters, clusterApi } = await client.listClusters();
        const withPools = clusters.filter(
          cluster => cluster.poolReleases.length > 0,
        );
        const results = await Promise.all(
          withPools.map(cluster =>
            client.listNodePools(cluster.name, cluster.namespace),
          ),
        );
        const rows = results.flatMap((result, index) => {
          const cluster = withPools[index];
          return result.nodePools.filter(isManagedPool).map(pool => ({
            id: `${installation}/${cluster.name}/${pool.name}`,
            installation,
            cluster,
            poolName: poolNameOf(pool, cluster.name),
            pool,
          }));
        });
        return { rows, note: clusterApiNote(clusterApi) };
      },
      staleTime: 30_000,
      // 10 s while a pool of the installation is unsettled, 60 s otherwise.
      refetchInterval: gpuNodePoolsRefetchInterval,
      retry: false,
    })),
  });

  const rows = useMemo(
    () => queries.flatMap(query => query.data?.rows ?? []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queries.map(query => query.dataUpdatedAt).join('|')],
  );
  const notes = queries
    .map((query, index) =>
      query.data?.note
        ? { installation: installations[index], note: query.data.note }
        : undefined,
    )
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  const errors = queries
    .map((query, index) =>
      query.error
        ? { installation: installations[index], error: query.error as Error }
        : undefined,
    )
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  return {
    rows,
    notes,
    errors,
    isLoading: Boolean(musterApi) && queries.some(query => query.isLoading),
  };
}

export type NodePoolWriteFailure = {
  kind: 'refused' | 'not-connected' | 'error';
  message: string;
  /** `delete_node_pool`'s replicas guard, when the refusal is that one. */
  guard?: ReplicasGuard;
};

export function classifyNodePoolWriteFailure(
  error: unknown,
): NodePoolWriteFailure {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof ClusterManagerNotConnectedError) {
    return { kind: 'not-connected', message };
  }
  const guard = parseReplicasGuard(message);
  return { kind: 'refused', message, guard };
}

export type NodePoolWriteState = {
  /** `create_node_pool` with `dryRun`: the manifests, nothing written. */
  dryRun: (input: CreateNodePoolInput) => Promise<NodePoolWriteResult>;
  /** `create_node_pool` as the person, `mode: apply` or `mode: commit`. */
  create: (
    input: CreateNodePoolInput,
    mode: WriteMode,
  ) => Promise<NodePoolWriteResult>;
  /** `delete_node_pool` as the person; `force` only after the guard showed. */
  remove: (
    input: DeleteNodePoolInput,
    options: { mode: WriteMode; force?: boolean },
  ) => Promise<NodePoolWriteResult>;
  isBusy: boolean;
  failure: NodePoolWriteFailure | undefined;
  reset: () => void;
};

/**
 * The writes of the node-pool dialogs, through cluster-manager over muster as
 * the signed-in person. A refusal is kept in cluster-manager's words; a
 * "not connected" answer from muster becomes the connect step; a successful
 * write invalidates the cluster and pool reads.
 */
export function useNodePoolWrite(
  installation: string | undefined,
): NodePoolWriteState {
  const client = useClusterManagerClient(installation);
  const queryClient = useQueryClient();
  const [isBusy, setBusy] = useState(false);
  const [failure, setFailure] = useState<NodePoolWriteFailure>();

  const run = useCallback(
    async (
      write: (c: ClusterManagerClient) => Promise<NodePoolWriteResult>,
      invalidate: boolean,
    ) => {
      if (!client) {
        throw new Error(
          'cluster-manager is not reachable: muster is not installed',
        );
      }
      setBusy(true);
      setFailure(undefined);
      try {
        const result = await write(client);
        if (invalidate) {
          await queryClient.invalidateQueries({
            queryKey: musterClustersQueryKey(client.installation),
          });
        }
        return result;
      } catch (error) {
        setFailure(classifyNodePoolWriteFailure(error));
        throw error;
      } finally {
        setBusy(false);
      }
    },
    [client, queryClient],
  );

  const dryRun = useCallback(
    (input: CreateNodePoolInput) =>
      run(c => c.createNodePool(input, { dryRun: true }), false),
    [run],
  );
  const create = useCallback(
    (input: CreateNodePoolInput, mode: WriteMode) =>
      run(c => c.createNodePool(input, { mode }), true),
    [run],
  );
  const remove = useCallback(
    (
      input: DeleteNodePoolInput,
      options: { mode: WriteMode; force?: boolean },
    ) => run(c => c.deleteNodePool(input, options), true),
    [run],
  );

  return {
    dryRun,
    create,
    remove,
    isBusy,
    failure,
    reset: () => setFailure(undefined),
  };
}
