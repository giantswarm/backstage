import { useCallback, useMemo, useState } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';

import { ClusterManagerClient } from '../apis/ClusterManagerClient';
import {
  CLUSTER_MANAGER_SERVER,
  classifyNodePoolWriteFailure,
  clusterApiNote,
  isManagedPool,
  offersTool,
  poolNameOf,
  type ClusterManagerTool,
  type ClusterManagerInfo,
  type ClusterWriteResult,
  type CreateClusterInput,
  type CreateNodePoolInput,
  type DeleteClusterInput,
  type DeleteNodePoolInput,
  type RemoveModelCacheInput,
  type NodePoolWriteFailure,
  type CacheClaim,
  type ManagedCluster,
  type NodePool,
  type NodePoolWriteResult,
  type WriteMode,
  type CreateNodePoolSchema,
} from '../lib/clusterManager';
import { gpuNodePoolsRefetchInterval } from '../lib/poolLifecycle';
import {
  musterCreateNodePoolSchemaQueryKey,
  musterClusterManagerInfoQueryKey,
  musterClusterReleasesQueryKey,
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

export type CreateNodePoolSchemaState = {
  schema: CreateNodePoolSchema | undefined;
  /** True while the schema is read: the form keeps the sections it declares in place meanwhile. */
  isLoading: boolean;
};

/**
 * The create tool's schema for the create dialog: the curated accelerators
 * and the arguments this installation's cluster-manager takes; `undefined`
 * while it is read, and `isLoading` says so.
 */
export function useCreateNodePoolSchema(
  installation: string | undefined,
): CreateNodePoolSchemaState {
  const client = useClusterManagerClient(installation);
  const { data, isLoading } = useQuery({
    queryKey: musterCreateNodePoolSchemaQueryKey(installation ?? ''),
    enabled: Boolean(client),
    queryFn: () => client!.createNodePoolSchema(),
    staleTime: 5 * 60_000,
    retry: false,
  });
  return { schema: data, isLoading: Boolean(client) && isLoading };
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

export {
  classifyNodePoolWriteFailure,
  type NodePoolWriteFailure,
} from '../lib/clusterManager';

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
  /** A write that changes something is on its way; a dry run is not one. */
  isWriting: boolean;
  failure: NodePoolWriteFailure | undefined;
  reset: () => void;
};

/**
 * What every cluster-manager write of one hook shares, as the options of its
 * mutation: the write as the person, its refusal kept in cluster-manager's
 * words (a "not connected" answer from muster becomes the connect step), one
 * failure for all of the hook's writes, cleared when a write starts, and a
 * re-read of the installation's clusters after a write that changed them.
 */
function useClusterManagerWrites(installation: string | undefined) {
  const client = useClusterManagerClient(installation);
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<NodePoolWriteFailure>();

  const writeOptions = <TVariables, TData>(
    write: (c: ClusterManagerClient, variables: TVariables) => Promise<TData>,
    invalidates: (variables: TVariables) => boolean,
  ) => ({
    mutationFn: (variables: TVariables) => {
      if (!client) {
        throw new Error(
          'cluster-manager is not reachable: muster is not installed',
        );
      }
      return write(client, variables);
    },
    onMutate: () => setFailure(undefined),
    onSuccess: async (_data: TData, variables: TVariables) => {
      if (client && invalidates(variables)) {
        await queryClient.invalidateQueries({
          queryKey: musterClustersQueryKey(client.installation),
        });
      }
    },
    onError: (error: Error) => setFailure(classifyNodePoolWriteFailure(error)),
  });

  const reset = useCallback(() => setFailure(undefined), []);
  return { writeOptions, failure, reset };
}

type NodePoolCreate = { input: CreateNodePoolInput; mode: WriteMode };
type NodePoolDelete = {
  input: DeleteNodePoolInput;
  options: { mode: WriteMode; force?: boolean };
};
type ModelCacheRemoval = {
  input: RemoveModelCacheInput;
  options: { mode: WriteMode; dryRun?: boolean };
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
  const { writeOptions, failure, reset } =
    useClusterManagerWrites(installation);

  const dryRun = useTrackedMutation({
    event: null,
    untrackedReason: 'A review (dry run) that writes nothing.',
    ...writeOptions(
      (c, input: CreateNodePoolInput) =>
        c.createNodePool(input, { dryRun: true }),
      () => false,
    ),
  });
  const create = useTrackedMutation({
    // A partial apply is finished by Continue, the same call: the call that
    // completes the pool reports it.
    event: (result, { mode }) =>
      result.partial
        ? null
        : { name: 'AgentPlatform.nodePoolCreated', attributes: { mode } },
    ...writeOptions(
      (c, { input, mode }: NodePoolCreate) => c.createNodePool(input, { mode }),
      () => true,
    ),
  });
  const remove = useTrackedMutation({
    event: null,
    untrackedReason: 'Node pool deletion is not a tracked portal action yet.',
    ...writeOptions(
      (c, { input, options }: NodePoolDelete) =>
        c.deleteNodePool(input, options),
      () => true,
    ),
  });
  const removeCache = useTrackedMutation({
    event: null,
    untrackedReason: 'Model cache removal is not a tracked portal action yet.',
    ...writeOptions(
      (c, { input, options }: ModelCacheRemoval) =>
        c.removeModelCache(input, options),
      ({ options }) => !options.dryRun,
    ),
  });

  const { mutateAsync: createAsync } = create;
  const { mutateAsync: removeAsync } = remove;
  const { mutateAsync: removeCacheAsync } = removeCache;
  return {
    dryRun: dryRun.mutateAsync,
    create: useCallback(
      (input: CreateNodePoolInput, mode: WriteMode) =>
        createAsync({ input, mode }),
      [createAsync],
    ),
    remove: useCallback(
      (input: DeleteNodePoolInput, options: NodePoolDelete['options']) =>
        removeAsync({ input, options }),
      [removeAsync],
    ),
    removeCache: useCallback(
      (input: RemoveModelCacheInput, options: ModelCacheRemoval['options']) =>
        removeCacheAsync({ input, options }),
      [removeCacheAsync],
    ),
    isBusy: [dryRun, create, remove, removeCache].some(m => m.isPending),
    isWriting:
      create.isPending ||
      remove.isPending ||
      (removeCache.isPending && !removeCache.variables?.options.dryRun),
    failure,
    reset,
  };
}

/** `list_releases` on one installation: what the Create cluster dialog offers. */
export function useClusterReleases(installation: string | undefined) {
  const client = useClusterManagerClient(installation);
  const { data, isLoading, error } = useQuery({
    queryKey: musterClusterReleasesQueryKey(installation ?? ''),
    enabled: Boolean(client),
    queryFn: () => client!.listReleases(),
    staleTime: 5 * 60_000,
    retry: false,
  });
  return {
    providers: data?.providers ?? [],
    releases: data?.releases ?? [],
    isLoading: Boolean(client) && isLoading,
    error: (error as Error) ?? null,
  };
}

export type ClusterWriteState = {
  /** `create_cluster` as the person; `dryRun` writes nothing. */
  create: (
    input: CreateClusterInput,
    options: { mode: WriteMode; dryRun?: boolean },
  ) => Promise<ClusterWriteResult>;
  /** `delete_cluster` as the person; `dryRun` lists what would go, or the refusal. */
  remove: (
    input: DeleteClusterInput,
    options: { mode: WriteMode; dryRun?: boolean },
  ) => Promise<ClusterWriteResult>;
  isBusy: boolean;
  /** A write that changes something is on its way; a dry run is not one. */
  isWriting: boolean;
  failure: NodePoolWriteFailure | undefined;
  reset: () => void;
};

type ClusterWriteOptions = { mode: WriteMode; dryRun?: boolean };
type ClusterWrite<TInput> = { input: TInput; options: ClusterWriteOptions };

/**
 * The writes of the Create cluster and Delete cluster dialogs, through
 * cluster-manager over muster as the signed-in person — the same handling as
 * the node-pool writes.
 */
export function useClusterWrite(
  installation: string | undefined,
): ClusterWriteState {
  const { writeOptions, failure, reset } =
    useClusterManagerWrites(installation);

  const create = useTrackedMutation({
    // A dry run is the dialog's review step and writes nothing; a partial
    // apply is finished by Continue, the same call, which reports it.
    event: (result, { options }) =>
      options.dryRun || result.partial
        ? null
        : {
            name: 'AgentPlatform.clusterCreated',
            attributes: { mode: options.mode },
          },
    ...writeOptions(
      (c, { input, options }: ClusterWrite<CreateClusterInput>) =>
        c.createCluster(input, options),
      ({ options }) => !options.dryRun,
    ),
  });
  const remove = useTrackedMutation({
    event: null,
    untrackedReason: 'Cluster deletion is not a tracked portal action yet.',
    ...writeOptions(
      (c, { input, options }: ClusterWrite<DeleteClusterInput>) =>
        c.deleteCluster(input, options),
      ({ options }) => !options.dryRun,
    ),
  });

  const { mutateAsync: createAsync } = create;
  const { mutateAsync: removeAsync } = remove;
  return {
    create: useCallback(
      (input: CreateClusterInput, options: ClusterWriteOptions) =>
        createAsync({ input, options }),
      [createAsync],
    ),
    remove: useCallback(
      (input: DeleteClusterInput, options: ClusterWriteOptions) =>
        removeAsync({ input, options }),
      [removeAsync],
    ),
    isBusy: create.isPending || remove.isPending,
    isWriting: [create, remove].some(
      m => m.isPending && !m.variables?.options.dryRun,
    ),
    failure,
    reset,
  };
}
