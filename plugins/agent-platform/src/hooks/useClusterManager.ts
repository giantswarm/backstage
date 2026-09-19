import { useCallback, useMemo, useState } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';

import { ClusterManagerClient } from '../apis/ClusterManagerClient';
import {
  CLUSTER_MANAGER_SERVER,
  ClusterManagerError,
  ClusterManagerNotConnectedError,
  clusterApiNote,
  isManagedPool,
  offersTool,
  poolNameOf,
  type ClusterManagerTool,
  type ClusterManagerInfo,
  type CreateNodePoolInput,
  type DeleteNodePoolInput,
  type RemoveModelCacheInput,
  type Refusal,
  type CacheClaim,
  type ManagedCluster,
  type NodePool,
  type NodePoolWriteResult,
  type WriteMode,
} from '../lib/clusterManager';
import { gpuNodePoolsRefetchInterval } from '../lib/poolLifecycle';
import {
  musterCreateNodePoolSchemaQueryKey,
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

/**
 * The create tool's schema for the create dialog: the curated accelerators
 * and the arguments this installation's cluster-manager takes; `undefined`
 * while it is read.
 */
export function useCreateNodePoolSchema(installation: string | undefined) {
  const client = useClusterManagerClient(installation);
  const { data } = useQuery({
    queryKey: musterCreateNodePoolSchemaQueryKey(installation ?? ''),
    enabled: Boolean(client),
    queryFn: () => client!.createNodePoolSchema(),
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

/**
 * One model cache claim of a cluster, as a row of the Model cache card: a
 * cluster keeps its claims after its last pool is gone, so the rows come from
 * every cluster `list_clusters` names, pool or not (giantswarm/backstage#2493).
 */
export type ModelCacheRow = {
  /** `<installation>/<cluster>/<claim>`, the row key. */
  id: string;
  installation: string;
  cluster: ManagedCluster;
  claim: CacheClaim;
};

/** What one installation's `list_clusters` → `list_node_pools` fan-out yields. */
type GpuNodePoolsOfInstallation = {
  rows: GpuNodePoolRow[];
  /** The model cache claims of every cluster listed, pool or not. */
  caches: ModelCacheRow[];
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
        const caches = clusters.flatMap(cluster =>
          (cluster.serving.readiness?.cacheClaims ?? []).map(claim => ({
            id: `${installation}/${cluster.name}/${claim.name}`,
            installation,
            cluster,
            claim,
          })),
        );
        return { rows, caches, note: clusterApiNote(clusterApi) };
      },
      staleTime: 30_000,
      // 10 s while a pool of the installation is unsettled, 60 s otherwise —
      // in a tab that is not focused too: a pool's serve intent is served the
      // moment its stack is ready, not when the person looks again.
      refetchInterval: gpuNodePoolsRefetchInterval,
      refetchIntervalInBackground: true,
      retry: false,
    })),
  });

  const rows = useMemo(
    () => queries.flatMap(query => query.data?.rows ?? []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queries.map(query => query.dataUpdatedAt).join('|')],
  );
  const caches = useMemo(
    () => queries.flatMap(query => query.data?.caches ?? []),
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
    caches,
    notes,
    errors,
    isLoading: Boolean(musterApi) && queries.some(query => query.isLoading),
  };
}

/**
 * The installations whose cluster-manager lists a tool (`get_info.tools`):
 * `remove_model_cache` is offered only where the installation's
 * cluster-manager has it (0.17+); an older one shows the cache read-only.
 */
export function useInstallationsOffering(
  installations: string[],
  tool: ClusterManagerTool,
): string[] {
  const musterApi = useMusterPluginApi();
  const queries = useQueries({
    queries: installations.map(installation => ({
      queryKey: musterClusterManagerInfoQueryKey(installation),
      enabled: Boolean(musterApi),
      queryFn: () =>
        new ClusterManagerClient(musterApi!, installation).getInfo(),
      staleTime: 60_000,
      retry: false,
    })),
  });
  const signature = queries
    .map((query, index) =>
      offersTool(query.data, tool) ? installations[index] : '',
    )
    .join('|');
  return useMemo(() => signature.split('|').filter(Boolean), [signature]);
}

export type NodePoolWriteFailure = {
  kind: 'refused' | 'not-connected' | 'error';
  message: string;
  /** The structured refusal (the nodes and models of a delete, the model cache of a create), when the answer carried one. */
  refused?: Refusal;
};

export function classifyNodePoolWriteFailure(
  error: unknown,
): NodePoolWriteFailure {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof ClusterManagerNotConnectedError) {
    return { kind: 'not-connected', message };
  }
  return {
    kind: 'refused',
    message,
    refused: error instanceof ClusterManagerError ? error.refused : undefined,
  };
}

export type NodePoolWriteState = {
  /** `create_node_pool` with `dryRun`: the manifests, nothing written. */
  dryRun: (input: CreateNodePoolInput) => Promise<NodePoolWriteResult>;
  /** `create_node_pool` as the person, `mode: apply` or `mode: commit`. */
  create: (
    input: CreateNodePoolInput,
    mode: WriteMode,
  ) => Promise<NodePoolWriteResult>;
  /** `delete_node_pool` as the person; `force` only after a refusal, as the second choice. */
  remove: (
    input: DeleteNodePoolInput,
    options: { mode: WriteMode; force?: boolean },
  ) => Promise<NodePoolWriteResult>;
  /** `remove_model_cache` as the person: the cluster's claims, or the one named. */
  removeCache: (
    input: RemoveModelCacheInput,
    options: { mode: WriteMode; dryRun?: boolean },
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
  const removeCache = useCallback(
    (
      input: RemoveModelCacheInput,
      options: { mode: WriteMode; dryRun?: boolean },
    ) => run(c => c.removeModelCache(input, options), !options.dryRun),
    [run],
  );

  return {
    dryRun,
    create,
    remove,
    removeCache,
    isBusy,
    failure,
    reset: () => setFailure(undefined),
  };
}
