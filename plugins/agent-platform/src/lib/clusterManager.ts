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

import { toolErrorDetails } from '@giantswarm/backstage-plugin-muster';

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

/**
 * Whether the installation serves the Cluster API (`cluster.x-k8s.io`), as
 * `get_info` and `list_clusters` report it from cluster-manager 0.4.1 on. On
 * an installation without it `list_clusters` answers no clusters and `note`
 * says why; the writes refuse naming the cluster and the group.
 */
export type ClusterApiStatus = {
  group: string;
  version: string;
  state: 'served' | 'absent' | 'unknown' | '';
  note?: string;
};

/**
 * The line to show where the Cluster API is not served — the tool's own note,
 * or one naming the group when the tool reports the state without it.
 * `undefined` where it is served, or for a cluster-manager that predates the
 * report.
 */
export function clusterApiNote(
  status: ClusterApiStatus | undefined,
): string | undefined {
  if (!status || status.state === 'served' || status.state === '') {
    return undefined;
  }
  return (
    status.note ||
    `the Cluster API (${status.group}) is not served on this installation`
  );
}

/** `get_info`: the version, the write modes offered and the tool names. */
export type ClusterManagerInfo = {
  version: string;
  modes: { apply: boolean; commit: boolean };
  tools: string[];
  clusterApi?: ClusterApiStatus;
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

/** A step's state in the managers' vocabulary (`list_node_pools` `steps[]`). */
export type LifecycleStepState = 'pending' | 'inProgress' | 'done' | 'failed';

/** `list_node_pools` `steps[]`: `release`, `machinePool`, `nodes`. */
export type PoolLifecycleStep = {
  name: string;
  state: LifecycleStepState;
  /** RFC3339: the condition's lastTransitionTime or the object's creation. */
  since?: string;
  finishedAt?: string;
  message?: string;
};

/** `list_node_pools` `phase`. */
export type PoolPhase =
  'creating' | 'ready' | 'scaling' | 'removing' | 'failed';

/** A HelmRelease's Ready condition as `list_clusters` `readiness` reports it. */
export type ReleaseReadiness = {
  name: string;
  namespace?: string;
  ready: boolean;
  reason?: string;
  message?: string;
  since?: string;
  deletedAt?: string;
};

/** `list_clusters` `gpuOperator.readiness` (cluster-manager 0.8+). */
export type GpuOperatorReadiness = {
  release: ReleaseReadiness | null;
  clusterPolicy: { name: string; state: string } | null;
  operands: {
    name: string;
    namespace: string;
    desired: number;
    ready: number;
  }[];
  /** Why `operands` is empty although a ClusterPolicy exists (scale-to-zero). */
  operandsMessage?: string;
  operandsError?: string;
};

/**
 * `list_clusters` `serving.readiness` (cluster-manager 0.8+). `backend.registered`
 * is `true` or `false` when the ConfigMap was read and absent, with `error`,
 * when it could not be read — never a bare `false` for a failed read.
 */
export type ServingReadiness = {
  release: ReleaseReadiness | null;
  children: ReleaseReadiness[];
  controllers: {
    name: string;
    namespace?: string;
    available: number;
    replicas: number;
  }[];
  configs: { count: number } | null;
  backend: {
    registered?: boolean;
    namespace?: string;
    name?: string;
    error?: string;
  };
  presets: { count: number } | null;
  modelsGateway: {
    name: string;
    namespace?: string;
    ready: boolean;
    reason?: string;
  } | null;
};

/** The GPU operator on a cluster; `readiness` from cluster-manager 0.8 on. */
export type GpuOperatorComponent = ClusterComponent & {
  readiness?: GpuOperatorReadiness;
};

/** The serving layer on a cluster; `readiness` from cluster-manager 0.8 on. */
export type ServingComponent = ClusterComponent & {
  readiness?: ServingReadiness;
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
  gpuOperator: GpuOperatorComponent;
  serving: ServingComponent;
  poolReleases: PoolRelease[];
  /** Null when no git repository owns the cluster. */
  commitTarget: CommitTarget | null;
};

/** `list_clusters`: the installation's clusters, and whether the Cluster API is served. */
export type ManagedClustersResult = {
  clusters: ManagedCluster[];
  clusterApi?: ClusterApiStatus;
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
  /** The pool's lifecycle (cluster-manager 0.8+); absent on an older one. */
  phase?: PoolPhase;
  steps?: PoolLifecycleStep[];
  /** `delete_node_pool` is under way: the teardown's objects still present. */
  deleting?: boolean | null;
  pending?: ObjectAction[];
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
    | typeof PENDING_ACTION
    | string;
  changes?: string[];
};

/** The action of an object a partial apply did not reach (cluster-manager 0.7.4+). */
export const PENDING_ACTION = 'pending';

/**
 * One instance size of the pool as composed: the node as the cloud lists it
 * and what it leaves a predictor after the kubelet's reservations and the
 * fleet's daemonsets (cluster-manager 0.6.0+, giantswarm/agent-platform#502).
 */
export type InstanceShape = {
  /** `<family>.<size>` (g6.xlarge). */
  instanceType: string;
  /** The size within the family (xlarge). */
  size: string;
  vcpu: number;
  memoryGiB: number;
  gpus: number;
  /** The memory of one GPU. */
  gpuMemoryGiB: number;
  usableVcpu: number;
  usableMemoryGiB: number;
};

/** One serving preset placed against the pool's sizes. */
export type PresetSizeFit = {
  preset: string;
  /** The predictor's requests as the preset writes them (`unset` for none). */
  cpu: string;
  memory: string;
  gpus: number;
  /** Weights plus overhead. */
  gpuMemoryGiB: number;
  /** The smallest of the pool's sizes that hosts the preset; empty with `reason` when none does. */
  size?: string;
  reason?: string;
};

/** The serving presets published on the cluster, judged against the pool's sizes. */
export type PresetFit = {
  /** Where the presets were read (`3 preset ConfigMap(s) in model-serving on wc1`). */
  source?: string;
  /** Why nothing was judged: no presets published yet, or not readable as the person. */
  note?: string;
  presets?: PresetSizeFit[];
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
  /** The pool's sizes as composed (a create), smallest first. */
  sizes?: InstanceShape[];
  /** The cluster's serving presets against the sizes. */
  presetFit?: PresetFit;
  /** Presets the accelerator could serve but no size of the pool hosts, naming the size that would. */
  warnings?: string[];
  /**
   * An apply that stopped writing to answer within the caller's deadline: the
   * objects it did not reach carry action `pending`; `nextStep` says to re-run
   * with the same arguments, the pending objects are written first.
   */
  partial?: boolean;
  nextStep?: string;
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

/**
 * `delete_node_pool`'s structured refusal (cluster-manager 0.8.1+), answered
 * as a second text block next to the message: the nodes the pool still runs,
 * the models served on the cluster to unload first (none: something else
 * holds the nodes), and the hint that explains the wait.
 */
export type DeleteRefusal = {
  nodes: string[];
  models: string[];
  hint: string;
};

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

/** The `refused` block among a tool error's further text blocks, if any. */
export function parseDeleteRefusal(
  details: string[],
): DeleteRefusal | undefined {
  for (const detail of details) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(detail);
    } catch {
      continue;
    }
    const refused = (parsed as { refused?: unknown } | null)?.refused;
    if (refused && typeof refused === 'object') {
      const block = refused as Record<string, unknown>;
      return {
        nodes: strings(block.nodes),
        models: strings(block.models),
        hint: typeof block.hint === 'string' ? block.hint : '',
      };
    }
  }
  return undefined;
}

/** A refusal cluster-manager answered, in its own words. */
export class ClusterManagerError extends Error {
  readonly name = 'ClusterManagerError';
  /** `delete_node_pool`'s structured refusal, when the answer carried one. */
  readonly refused?: DeleteRefusal;

  constructor(message: string, refused?: DeleteRefusal) {
    super(message);
    this.refused = refused;
  }
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
  return new ClusterManagerError(
    message,
    parseDeleteRefusal(toolErrorDetails(error)),
  );
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

/** The objects a partial apply left for the re-run. */
export function pendingObjects(
  result: Pick<NodePoolWriteResult, 'objects'>,
): ObjectAction[] {
  return result.objects.filter(object => object.action === PENDING_ACTION);
}

/** `3 vCPU / 11.9 GiB usable` — what a predictor may request on a node of this size. */
export function describeUsable(shape: InstanceShape): string {
  return `${trimNumber(shape.usableVcpu)} vCPU / ${trimNumber(
    shape.usableMemoryGiB,
  )} GiB usable`;
}

/** `1 × 24 GiB GPU`, `4 × 24 GiB GPUs`. */
export function describeGpus(
  shape: Pick<InstanceShape, 'gpus' | 'gpuMemoryGiB'>,
): string {
  return `${shape.gpus} × ${shape.gpuMemoryGiB} GiB GPU${shape.gpus === 1 ? '' : 's'}`;
}

/** `4 vCPU / 12Gi, 1 GPU, 9.6 GiB of GPU memory` — what the preset's predictor asks for. */
export function describePresetNeeds(fit: PresetSizeFit): string {
  const gpus = `${fit.gpus} GPU${fit.gpus === 1 ? '' : 's'}`;
  return `${fit.cpu} vCPU / ${fit.memory}, ${gpus}, ${trimNumber(
    fit.gpuMemoryGiB,
  )} GiB of GPU memory`;
}

/** The fit of one preset by name. */
export function presetFitOf(
  fit: PresetFit | undefined,
  preset: string | undefined,
): PresetSizeFit | undefined {
  return preset
    ? fit?.presets?.find(candidate => candidate.preset === preset)
    : undefined;
}

/**
 * The sizes that host a preset: cluster-manager names the smallest, and the
 * sizes are listed smallest first, so every size from that one on hosts it.
 */
export function sizesHosting(
  shapes: InstanceShape[],
  fit: PresetSizeFit | undefined,
): string[] {
  const smallest = shapes.findIndex(shape => shape.size === fit?.size);
  return smallest < 0 ? [] : shapes.slice(smallest).map(shape => shape.size);
}

/**
 * The size cluster-manager says would host a preset none of the pool's sizes
 * does — `… — 2xlarge (8 vCPU / 32 GiB) would host it` at the end of a reason
 * or a warning.
 */
export function sizeThatWouldHost(
  text: string | undefined,
): string | undefined {
  return text?.match(/ — (\S+) \([^)]*\) would host it/)?.[1];
}

/** Whether a warning line is about the preset (`serving preset <name> fits no size …`). */
export function isWarningFor(warning: string, preset: string): boolean {
  return warning.startsWith(`serving preset ${preset} `);
}

/**
 * Why Deploy is blocked: the preset the person wants to serve fits no size of
 * the pool as reviewed. Any other preset's warning stands out but does not
 * block.
 */
export function deployBlocker(
  review: Pick<NodePoolWriteResult, 'presetFit'> | undefined,
  preset: string | undefined,
): PresetSizeFit | undefined {
  const fit = presetFitOf(review?.presetFit, preset);
  return fit && !fit.size ? fit : undefined;
}

function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
