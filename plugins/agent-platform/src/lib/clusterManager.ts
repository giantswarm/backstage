/**
 * cluster-manager's tool contract, as the portal calls it through muster.
 *
 * cluster-manager is the Agent Platform's write surface for GPU node pools: it
 * composes the pool's release of the gpu-node-pool chart (a Flux `HelmRelease`
 * and its `OCIRepository` in the cluster's `org-` namespace), detects the GPU
 * operator and the serving layer on the cluster and composes them where absent,
 * registers the serving cluster as a `kserve` backend with model-manager, and
 * writes everything as the caller. It speaks MCP only; the portal reaches it as
 * the signed-in person through the installation's muster, where its tools
 * appear as `x_cluster-manager_<tool>`. The shapes here mirror `internal/tools`
 * and `internal/api/mcp.go` of giantswarm/cluster-manager — the portal composes
 * nothing of its own (bumblebee-plans#46, D2 and D7).
 */

import { looksNotConnected, type CommitAgentResult } from './agentManager';

/** The MCPServer name muster registers cluster-manager under. */
export const CLUSTER_MANAGER_SERVER = 'cluster-manager';

/** The tools this plugin calls, by their cluster-manager name. */
export const CLUSTER_MANAGER_TOOLS = {
  getInfo: 'get_info',
  listClusters: 'list_clusters',
  listNodePools: 'list_node_pools',
  createNodePool: 'create_node_pool',
  deleteNodePool: 'delete_node_pool',
} as const;

export type ClusterManagerTool =
  (typeof CLUSTER_MANAGER_TOOLS)[keyof typeof CLUSTER_MANAGER_TOOLS];

/** `x_<server>_<tool>`: how muster exposes an aggregated server's tool. */
export function clusterManagerToolName(tool: ClusterManagerTool): string {
  return `x_${CLUSTER_MANAGER_SERVER}_${tool}`;
}

/** A write's mode: land the objects live, or open a pull request. */
export type WriteMode = 'apply' | 'commit';

/** `get_info`: the version, the write modes offered and the tool names. */
export type ClusterManagerInfo = {
  version: string;
  modes: { apply: boolean; commit: boolean };
  tools: string[];
};

/**
 * Who provides a component on a cluster: `chart` — the platform's own release,
 * `cluster-manager` — a release cluster-manager composed, `manual` — by hand.
 */
export type ComponentProvider = 'chart' | 'cluster-manager' | 'manual' | '';

export type ComponentStatus = 'present' | 'absent' | 'unknown' | '';

/** The GPU operator or the serving layer on a cluster, as detected. */
export type ClusterComponent = {
  status: ComponentStatus;
  provider?: ComponentProvider;
  /** The objects the verdict rests on. */
  evidence?: string[];
  /** Why the status is unknown. */
  reason?: string;
};

/** A HelmRelease of the gpu-node-pool chart on a cluster. */
export type PoolRelease = {
  name: string;
  namespace: string;
  chartVersion: string;
  ready: boolean | null;
};

/** The git repository and path owning a cluster (Flux provenance). */
export type CommitTarget = {
  repository: string;
  path: string;
};

/** `list_clusters`: one cluster of the installation. */
export type ManagedCluster = {
  name: string;
  namespace: string;
  organization: string;
  releaseVersion: string;
  /** The installation's own cluster (its management cluster). */
  ownCluster: boolean;
  gpuOperator: ClusterComponent;
  serving: ClusterComponent;
  poolReleases: PoolRelease[];
  /** Null when no git repository owns the cluster. */
  commitTarget: CommitTarget | null;
};

/** `list_node_pools`: one MachinePool of a cluster. */
export type NodePool = {
  name: string;
  namespace: string;
  /** The pool's Kubernetes version. */
  version: string;
  /** The control plane's Kubernetes version; no verdict is drawn. */
  controlPlaneVersion: string;
  replicas: number;
  readyReplicas: number;
  instanceTypes: string[];
  accelerator?: string;
  /** The HelmRelease owning the pool; null for a pool created by other means. */
  ownerRelease: { name: string; namespace: string } | null;
};

export type NodePoolsResult = {
  cluster: string;
  namespace: string;
  controlPlaneVersion: string;
  nodePools: NodePool[];
};

/** What a write would do, or did, to one object. */
export type ObjectAction = {
  apiVersion: string;
  kind: string;
  name: string;
  namespace: string;
  action:
    | 'would-create'
    | 'would-update'
    | 'would-delete'
    | 'created'
    | 'updated'
    | 'deleted'
    | 'unchanged'
    | string;
  changes?: string[];
};

/** A rendered Kubernetes object, as cluster-manager returns it. */
export type Manifest = {
  apiVersion?: string;
  kind?: string;
  metadata?: { name?: string; namespace?: string; [key: string]: unknown };
  [key: string]: unknown;
};

/** The kserve backend registered with model-manager for the serving cluster. */
export type BackendRegistration = {
  kind: string;
  namespace: string;
  name: string;
  target: string;
};

/** `create_node_pool` and `delete_node_pool`: the write, dry or real. */
export type NodePoolWriteResult = {
  cluster: string;
  namespace: string;
  pool: string;
  mode: WriteMode;
  dryRun: boolean;
  chartVersion?: string;
  kubernetesVersion?: string;
  controlPlaneVersion?: string;
  machineImage?: string;
  objects: ObjectAction[];
  /** The rendered manifests (a dry run, or an apply that reports them). */
  manifests?: Manifest[];
  gpuOperator?: ClusterComponent;
  operatorRow?: string;
  backend?: BackendRegistration;
  /** A delete that takes the cluster's operator release and backend with it. */
  lastPool?: boolean;
} & CommitAgentResult;

/** What the dialog sends to `create_node_pool`; the tool fills every default. */
export type CreateNodePoolInput = {
  cluster: string;
  namespace?: string;
  name: string;
  accelerator?: string;
  sizes?: string[];
  maxGpus?: number;
  teleport?: boolean;
  chartVersion?: string;
};

export type DeleteNodePoolInput = {
  cluster: string;
  namespace?: string;
  name: string;
};

/**
 * The curated accelerators as the shipped `create_node_pool` schema enumerates
 * them — the fallback when the tool's schema cannot be read from muster.
 */
export const DEFAULT_ACCELERATORS: readonly string[] = [
  'nvidia-l4',
  'nvidia-a10g',
  'nvidia-t4',
  'nvidia-l40s',
];

/** The chart's pool-name pattern: five to twenty of `[a-z0-9-]`. */
export const POOL_NAME_PATTERN = /^[a-z0-9][-a-z0-9]{3,18}[a-z0-9]$/;

export function isValidPoolName(name: string): boolean {
  return POOL_NAME_PATTERN.test(name);
}

/** A refusal cluster-manager answered, in its own words. */
export class ClusterManagerError extends Error {
  readonly name = 'ClusterManagerError';
}

/**
 * The person's muster session holds no connection to cluster-manager yet (the
 * frontend counterpart of gs-node's `MusterServerNotConnectedError`).
 */
export class ClusterManagerNotConnectedError extends Error {
  readonly name = 'ClusterManagerNotConnectedError';
}

/**
 * Classifies what a tool call threw: muster's "not connected" answers become
 * {@link ClusterManagerNotConnectedError}; everything else is cluster-manager's
 * refusal or the apiserver's answer, kept verbatim as
 * {@link ClusterManagerError}.
 */
export function classifyClusterManagerError(error: unknown): Error {
  if (
    error instanceof ClusterManagerError ||
    error instanceof ClusterManagerNotConnectedError
  ) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (looksNotConnected(message)) {
    return new ClusterManagerNotConnectedError(message);
  }
  return new ClusterManagerError(message);
}

/**
 * `delete_node_pool`'s replicas guard, parsed from the refusal: "node pool
 * <name> still runs <n> node(s) (<node>, <node>): …". Undefined for any other
 * refusal — those are shown verbatim.
 */
export type ReplicasGuard = {
  pool: string;
  count: number;
  nodes: string[];
  message: string;
};

const REPLICAS_GUARD = /node pool (\S+) still runs (\d+) node\(s\) \(([^)]*)\)/;

export function parseReplicasGuard(message: string): ReplicasGuard | undefined {
  const match = message.match(REPLICAS_GUARD);
  if (!match) {
    return undefined;
  }
  return {
    pool: match[1],
    count: Number(match[2]),
    nodes: match[3]
      .split(',')
      .map(node => node.trim())
      .filter(Boolean),
    message,
  };
}

/** A manifest's file name in the review: `<kind>-<name>.yaml`. */
export function manifestFilename(manifest: Manifest): string {
  const kind = (manifest.kind ?? 'object').toLowerCase();
  const name = manifest.metadata?.name ?? 'unnamed';
  return `${kind}-${name}.yaml`;
}

/** The manifests of one composed release, grouped for the review. */
export type ReleaseGroup = {
  /** The release name (the HelmRelease's), or the object's name when alone. */
  name: string;
  /** What the group is: the pool, the GPU operator, the serving slice, … */
  role: 'pool' | 'gpu-operator' | 'agent-platform' | 'backend' | 'other';
  manifests: Manifest[];
};

/**
 * Groups a dry run's manifests by the release they belong to — the pool's
 * HelmRelease with its OCIRepository and values Secret, `<cluster>-gpu-operator`
 * when composed, `<cluster>-agent-platform` when composed, the kserve backend
 * registration — so the review reads as releases, not as a flat list.
 */
export function groupManifestsByRelease(
  result: Pick<NodePoolWriteResult, 'cluster' | 'pool' | 'manifests'>,
): ReleaseGroup[] {
  const groups = new Map<string, ReleaseGroup>();
  const poolRelease = `${result.cluster}-${result.pool}`;
  for (const manifest of result.manifests ?? []) {
    const name = manifest.metadata?.name ?? 'unnamed';
    const release = name.replace(/-values$/, '');
    let role: ReleaseGroup['role'] = 'other';
    if (release === poolRelease) {
      role = 'pool';
    } else if (release === `${result.cluster}-gpu-operator`) {
      role = 'gpu-operator';
    } else if (release === `${result.cluster}-agent-platform`) {
      role = 'agent-platform';
    } else if (
      manifest.kind === 'ConfigMap' &&
      release.startsWith('model-backend-')
    ) {
      role = 'backend';
    }
    const key = role === 'other' ? name : release;
    const group = groups.get(key) ?? { name: key, role, manifests: [] };
    group.manifests.push(manifest);
    groups.set(key, group);
  }
  return Array.from(groups.values());
}

/** How a release group is titled in the review. */
export function describeReleaseGroup(group: ReleaseGroup): string {
  switch (group.role) {
    case 'pool':
      return `${group.name} — the GPU node pool`;
    case 'gpu-operator':
      return `${group.name} — the GPU operator (none detected on the cluster)`;
    case 'agent-platform':
      return `${group.name} — model serving on this cluster`;
    case 'backend':
      return `${group.name} — the serving backend registered with model-manager`;
    default:
      return group.name;
  }
}

/** The pools cluster-manager owns: a pool with an owning HelmRelease. */
export function isManagedPool(pool: NodePool): boolean {
  return pool.ownerRelease !== null;
}

/**
 * The pool name as given to `create_node_pool`: cluster-manager names the
 * MachinePool `<cluster>-<name>`.
 */
export function poolNameOf(
  pool: Pick<NodePool, 'name'>,
  cluster: string,
): string {
  return pool.name.startsWith(`${cluster}-`)
    ? pool.name.slice(cluster.length + 1)
    : pool.name;
}

/** How a component's provider reads in a mark of the cluster list. */
const PROVIDER_LABEL: Record<string, string> = {
  chart: "the platform's release",
  'cluster-manager': 'cluster-manager',
  manual: 'by hand',
};

/** The provider of a detected component, for a mark in the cluster list. */
export function describeComponent(
  component: ClusterComponent | undefined,
  label: string,
): string {
  if (!component || !component.status || component.status === 'unknown') {
    const reason = component?.reason ? ` (${component.reason})` : '';
    return `${label}: unknown${reason}`;
  }
  if (component.status === 'absent') {
    return `${label}: absent`;
  }
  const provider = component.provider
    ? (PROVIDER_LABEL[component.provider] ?? component.provider)
    : 'present';
  return `${label}: ${provider}`;
}
