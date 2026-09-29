import type { Page } from '@playwright/test';

/**
 * cluster-manager's answers for the Add GPU node pool dialog (0.8.1's shapes,
 * with the prices per size and the preset display names, models and origin
 * of giantswarm/cluster-manager#44), stubbed at the browser: the lab has no
 * cluster-manager (no Cluster API on a kind cluster), so the muster calls the
 * dialog makes are answered here in the
 * shapes `internal/tools/nodepool_write.go` produces, and the lab's muster
 * server list gains a `cluster-manager` entry so the page offers the dialog.
 *
 * The `sizes[]` shape of g6.xlarge and the "no serving preset is published"
 * note are a real dry run on gazelle (2026-09-17, `create_node_pool
 * nvidia-l4 [xlarge] dryRun`). The presets are the platform's nine
 * (`agent-platform-connectivity/files/model-serving/presets`) with their real
 * requests; their GPU-memory figures, the usable numbers of 2xlarge and
 * 4xlarge and the fit verdicts are synthetic — gazelle had no pool, so no
 * preset was published to judge (giantswarm/backstage#2413). The prices are
 * the Frankfurt on-demand list prices of the three sizes (2026-09-17); the
 * display names and models are the presets' own.
 */

/** The cluster's node-subnet zones, as `list_clusters` names them (cluster-manager 0.16+). */
export const ZONES = ['eu-central-1a', 'eu-central-1b', 'eu-central-1c'];

export const CLUSTER = {
  name: 'wc1',
  namespace: 'org-lab',
  organization: 'lab',
  releaseVersion: '31.0.0',
  ownCluster: false,
  gpuOperator: { status: 'absent' },
  serving: { status: 'absent' },
  poolReleases: [],
  zones: ZONES,
  commitTarget: null,
};

/**
 * `create_node_pool`'s schema as muster describes the tool: the curated
 * accelerators, and the arguments the form feature-detects (`zones`,
 * `cache`; cluster-manager 0.16+).
 */
export const CREATE_NODE_POOL_SCHEMA = {
  name: 'x_cluster-manager_create_node_pool',
  description:
    'Create a GPU node pool for a cluster, or update the pool of that name.',
  inputSchema: {
    type: 'object',
    properties: {
      cluster: { type: 'string' },
      namespace: { type: 'string' },
      name: { type: 'string' },
      accelerator: {
        type: 'string',
        enum: ['nvidia-l4', 'nvidia-a10g', 'nvidia-t4', 'nvidia-l40s'],
      },
      sizes: { type: 'array', items: { type: 'string' } },
      maxGpus: { type: 'number' },
      prewarm: { type: 'boolean' },
      zones: { type: 'array', items: { type: 'string' } },
      cache: { type: 'boolean' },
      mode: { type: 'string' },
      dryRun: { type: 'boolean' },
    },
    required: ['cluster', 'name'],
  },
};

/**
 * cluster-manager's word on the zones and the model cache for the choice a
 * call carries (0.16+): the pin as named, and the claim the slice mounts or
 * the cache off.
 */
export function placementAnswer(args: Record<string, unknown>) {
  const zones = args.zones as string[] | undefined;
  const cache = args.cache !== false;
  const pinned = zones
    ? `nodes pinned to ${zones.join(', ')}, the zones named on create`
    : 'the pool’s nodes are not pinned to a zone';
  return {
    ...(zones ? { zones } : {}),
    zonesNote: cache
      ? `${pinned}; the slice mounts the model cache claim model-serving/hf-cache, which does not exist yet: the connectivity chart creates it and keeps it, and the first predictor binds it to a volume in its node's zone`
      : `${pinned}; this pool's slice serves without the model cache (cache false), so no zone follows from a claim`,
    cache: cache
      ? {
          enabled: true,
          claim: 'model-serving/hf-cache',
          exists: false,
          capacity: '100Gi',
          tier: 'gp3, 500 MiB/s, 3000 IOPS',
          monthlyPriceUSD: 27.37,
          priceSource: 'AWS EBS gp3 list price, EU (Frankfurt) (eu-central-1)',
          priceAsOf: '2026-09-19',
          note: 'the predictors mount the model cache claim model-serving/hf-cache — it does not exist yet: the connectivity chart creates it and keeps it at its defaults, 100Gi gp3, 500 MiB/s, 3000 IOPS: about $27.37 a month at list prices',
        }
      : {
          enabled: false,
          note: 'modelServing.cache.enabled false on the slice release: no claim is applied or mounted, every predictor downloads its weights into its pod’s ephemeral storage',
        },
  };
}

const CLUSTER_API = {
  group: 'cluster.x-k8s.io',
  version: 'v1beta1',
  state: 'served',
};

export const INFO = {
  version: '0.17.0',
  modes: { apply: true, commit: false },
  tools: [
    'get_info',
    'list_clusters',
    'list_node_pools',
    'create_node_pool',
    'delete_node_pool',
    'enable_model_serving',
    'disable_model_serving',
    'remove_model_cache',
  ],
  clusterApi: CLUSTER_API,
};

/**
 * A model cache claim kept on the cluster after its last pool went, as
 * cluster-manager 0.17 reads it (giantswarm/cluster-manager#83): a 100 GiB gp3
 * volume at 500 MiB/s in one zone, $27.37 a month at Frankfurt's list prices
 * — the shape of a real claim an installation kept for a day (2026-09-19).
 */
export const KEPT_CLAIM = {
  namespace: 'model-serving',
  name: 'hf-cache',
  phase: 'Bound',
  volume: 'pvc-cd15b89b-fed9-48d3-8b96-cccc5f00dd9f',
  zone: 'eu-central-1b',
  capacity: '100Gi',
  capacityGiB: 100,
  storageClass: 'agent-platform-connectivity-hf-cache-e11f27cb',
  tier: { type: 'gp3', iops: 3000, throughputMiBps: 500 },
  reclaimPolicy: 'Delete',
  created: '2026-09-18T20:31:04Z',
  price: {
    monthlyUSD: 27.37,
    source: 'AWS EBS gp3 list price, EU (Frankfurt) (eu-central-1)',
    asOf: '2026-09-19',
  },
};

/** `list_clusters` for a cluster that keeps a cache: its slice runs with the cache on, mounting the claim (0.17+). */
export function keptCacheCluster(mounted: boolean) {
  return {
    ...CLUSTER,
    serving: mounted
      ? {
          status: 'present',
          provider: 'cluster-manager',
          readiness: {
            release: {
              name: `${CLUSTER.name}-agent-platform`,
              namespace: CLUSTER.namespace,
              ready: true,
              reason: 'InstallSucceeded',
            },
            children: [],
            controllers: [],
            configs: null,
            backend: { registered: true },
            presets: null,
            modelsGateway: null,
            cache: { enabled: true, claim: KEPT_CLAIM.name },
            cacheClaims: [{ ...KEPT_CLAIM, mounted: true }],
          },
        }
      : {
          status: 'absent',
          readiness: {
            release: null,
            children: [],
            controllers: [],
            configs: null,
            backend: { registered: false },
            presets: null,
            modelsGateway: null,
            cache: null,
            cacheClaims: [KEPT_CLAIM],
          },
        },
  };
}

/** `remove_model_cache` with `mode: apply` on the kept claim: the claim deleted, the slice upgraded where it mounted it. */
export function removeCacheAnswer(mounted: boolean) {
  return {
    cluster: CLUSTER.name,
    namespace: CLUSTER.namespace,
    mode: 'apply',
    dryRun: false,
    objects: [
      ...(mounted
        ? [
            {
              apiVersion: 'helm.toolkit.fluxcd.io/v2',
              kind: 'HelmRelease',
              name: `${CLUSTER.name}-agent-platform`,
              namespace: CLUSTER.namespace,
              action: 'updated',
              changes: ['spec.values.modelServing.cache.enabled'],
            },
          ]
        : []),
      {
        apiVersion: 'v1',
        kind: 'PersistentVolumeClaim',
        name: KEPT_CLAIM.name,
        namespace: KEPT_CLAIM.namespace,
        action: 'deleted',
      },
    ],
    removedClaims: [KEPT_CLAIM],
    cacheClaims: [KEPT_CLAIM],
    cache: {
      enabled: false,
      note: `the model cache of ${CLUSTER.name} is removed: 1 claim(s) deleted`,
    },
  };
}

type Shape = {
  instanceType: string;
  size: string;
  vcpu: number;
  memoryGiB: number;
  gpus: number;
  gpuMemoryGiB: number;
  usableVcpu: number;
  usableMemoryGiB: number;
  pricePerHourUSD?: number;
  priceSource?: string;
  priceAsOf?: string;
  priceNote?: string;
};

/** Where cluster-manager read the prices, and when. */
export const PRICE_SOURCE =
  'AWS EC2 on-demand Linux list price, EU (Frankfurt) (eu-central-1)';
export const PRICE_AS_OF = '2026-09-17';

const priced = (pricePerHourUSD: number) => ({
  pricePerHourUSD,
  priceSource: PRICE_SOURCE,
  priceAsOf: PRICE_AS_OF,
});

/** The g6 (L4) family as the chart's default sizes compose it, smallest first, priced. */
export const SHAPES: Shape[] = [
  {
    instanceType: 'g6.xlarge',
    size: 'xlarge',
    vcpu: 4,
    memoryGiB: 16,
    gpus: 1,
    gpuMemoryGiB: 24,
    usableVcpu: 3,
    usableMemoryGiB: 11.9,
    ...priced(1.0064),
  },
  {
    instanceType: 'g6.2xlarge',
    size: '2xlarge',
    vcpu: 8,
    memoryGiB: 32,
    gpus: 1,
    gpuMemoryGiB: 24,
    usableVcpu: 6.5,
    usableMemoryGiB: 26.9,
    ...priced(1.22249),
  },
  {
    instanceType: 'g6.4xlarge',
    size: '4xlarge',
    vcpu: 16,
    memoryGiB: 64,
    gpus: 1,
    gpuMemoryGiB: 24,
    usableVcpu: 14.5,
    usableMemoryGiB: 58.4,
    ...priced(1.65466),
  },
];

type Preset = {
  preset: string;
  displayName: string;
  model: string;
  cpu: string;
  memory: string;
  gpus: number;
  gpuMemoryGiB: number;
};

/** The platform's presets: the two L4-class ones and the seven 128 GB ones. */
export const PRESETS: Preset[] = [
  {
    preset: 'qwen3-4b-instruct',
    displayName: 'Qwen3 4B Instruct',
    model: 'Qwen/Qwen3-4B-Instruct-2507',
    cpu: '4',
    memory: '12Gi',
    gpus: 1,
    gpuMemoryGiB: 9.6,
  },
  {
    preset: 'qwen3-8b-fp8',
    displayName: 'Qwen3 8B FP8',
    model: 'Qwen/Qwen3-8B-FP8',
    cpu: '4',
    memory: '12Gi',
    gpus: 1,
    gpuMemoryGiB: 10.8,
  },
  {
    preset: 'devstral-small-2',
    displayName: 'Devstral Small 2',
    model: 'mistralai/Devstral-Small-2-24B-Instruct-2512',
    cpu: '8',
    memory: '64Gi',
    gpus: 1,
    gpuMemoryGiB: 57.6,
  },
  {
    preset: 'nemotron-3-super-nvfp4',
    displayName: 'Nemotron 3 Super NVFP4',
    model: 'nvidia/Nemotron-3-Super-NVFP4',
    cpu: '8',
    memory: '64Gi',
    gpus: 1,
    gpuMemoryGiB: 90,
  },
  {
    preset: 'qwen3-14b',
    displayName: 'Qwen3 14B',
    model: 'Qwen/Qwen3-14B',
    cpu: '8',
    memory: '64Gi',
    gpus: 1,
    gpuMemoryGiB: 33.6,
  },
  {
    preset: 'qwen3-5-27b',
    displayName: 'Qwen3.5 27B',
    model: 'Qwen/Qwen3.5-27B',
    cpu: '8',
    memory: '64Gi',
    gpus: 1,
    gpuMemoryGiB: 64.8,
  },
  {
    preset: 'qwen3-5-35b-a3b',
    displayName: 'Qwen3.5 35B A3B',
    model: 'Qwen/Qwen3.5-35B-A3B',
    cpu: '8',
    memory: '64Gi',
    gpus: 1,
    gpuMemoryGiB: 84,
  },
  {
    preset: 'qwen3-8-27b',
    displayName: 'Qwen3.8 27B',
    model: 'Qwen/Qwen3.8-27B',
    cpu: '8',
    memory: '64Gi',
    gpus: 1,
    gpuMemoryGiB: 62.4,
  },
  {
    preset: 'qwen3-coder-next',
    displayName: 'Qwen3 Coder Next',
    model: 'Qwen/Qwen3-Coder-Next-FP8',
    cpu: '8',
    memory: '64Gi',
    gpus: 1,
    gpuMemoryGiB: 96,
  },
];

/** The presets an L4 pool could serve at all — the ones a missing size warns about. */
export const L4_PRESETS = ['qwen3-4b-instruct', 'qwen3-8b-fp8'];

const gib = (memory: string) => Number(memory.replace(/Gi$/, ''));

/** `compose.Fit` as cluster-manager words it: the smallest size hosting the preset, or why none does. */
function fit(shapes: Shape[], preset: Preset) {
  const largest = SHAPES[SHAPES.length - 1];
  if (preset.gpuMemoryGiB > largest.gpuMemoryGiB) {
    return {
      reason: `needs ${preset.gpuMemoryGiB} GiB of GPU memory across ${preset.gpus} GPU(s); a g6 GPU has ${largest.gpuMemoryGiB} GiB`,
      hostable: false,
    };
  }
  const hosts = (shape: Shape) =>
    shape.usableVcpu >= Number(preset.cpu) &&
    shape.usableMemoryGiB >= gib(preset.memory);
  const host = shapes.find(hosts);
  if (host) {
    return { size: host.size, hostable: true };
  }
  const tight = shapes[shapes.length - 1];
  const would = SHAPES.find(hosts);
  const reason = `requests ${preset.cpu} vCPU / ${preset.memory}; ${tight.size} leaves a predictor ${tight.usableVcpu} vCPU / ${tight.usableMemoryGiB} GiB after the node's kubelet reservations and daemonsets`;
  return would
    ? {
        reason: `${reason} — ${would.size} (${would.vcpu} vCPU / ${would.memoryGiB} GiB) would host it`,
        hostable: true,
      }
    : { reason, hostable: false };
}

function objects(cluster: string, pool: string, action: string) {
  const release = (name: string, namespace: string) => [
    {
      apiVersion: 'source.toolkit.fluxcd.io/v1',
      kind: 'OCIRepository',
      name,
      namespace,
      action,
    },
    {
      apiVersion: 'helm.toolkit.fluxcd.io/v2',
      kind: 'HelmRelease',
      name,
      namespace,
      action,
    },
  ];
  return [
    ...release(`${cluster}-${pool}`, 'org-lab'),
    ...release(`${cluster}-agent-platform`, 'org-lab'),
    {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      name: 'model-backend-kserve',
      namespace: 'agent-platform',
      action,
    },
    ...release(`${cluster}-gpu-operator`, 'org-lab'),
  ];
}

export type DryRunOptions = {
  /** `false`: nothing could be judged — `presetFit.note` alone (an older cluster-manager, an unreadable cluster). */
  presets?: boolean;
  /** Where the presets come from: the slice's ConfigMaps (default), or the chart before the slice exists. */
  presetOrigin?: 'published' | 'chart';
};

/** How `presetFit.source` words each origin. */
export const PRESET_SOURCE = {
  published: `${PRESETS.length} preset ConfigMap(s) in model-serving on ${CLUSTER.name}`,
  chart: `${PRESETS.length} preset(s) shipped by agent-platform-connectivity 4.30.0, the chart the slice's agent-platform 4.29.1 release resolves for ">=4.0.0 <5.0.0" at gsoci.azurecr.io — the slice publishes them once it is ready`,
} as const;

/** `create_node_pool` with `dryRun` for the chosen sizes (the chart's defaults when none). */
export function dryRunAnswer(
  pool: string,
  sizes: string[] | undefined,
  options: DryRunOptions = {},
) {
  const chosen = sizes
    ? SHAPES.filter(shape => sizes.includes(shape.size))
    : SHAPES;
  const judged = PRESETS.map(preset => {
    const { hostable, ...verdict } = fit(chosen, preset);
    return { entry: { ...preset, ...verdict }, hostable };
  });
  const warnings = judged
    .filter(({ entry, hostable }) => !entry.size && hostable)
    .map(
      ({ entry }) =>
        `serving preset ${entry.preset} fits no size of pool ${pool}: ${entry.reason} — a predictor composed from it would sit Pending while Karpenter refuses every size (giantswarm/agent-platform#502); add the size to sizes or serve a smaller preset`,
    );
  const presetFit =
    options.presets === false
      ? {
          note: `no serving preset is published on ${CLUSTER.name} yet — the slice release publishes them once it is ready; a dryRun re-run then says which of the pool's sizes host each`,
        }
      : {
          origin: options.presetOrigin ?? 'published',
          source: PRESET_SOURCE[options.presetOrigin ?? 'published'],
          presets: judged.map(({ entry }) => entry),
        };
  return {
    cluster: CLUSTER.name,
    namespace: CLUSTER.namespace,
    pool,
    mode: 'apply',
    dryRun: true,
    chartVersion: '0.3.1',
    kubernetesVersion: '1.31.4',
    controlPlaneVersion: 'v1.31.4',
    machineImage: 'flatcar-stable-4152.2.3-kube-1.31.4-tooling-1.27.0-gs',
    objects: objects(CLUSTER.name, pool, 'would-create'),
    manifests: [
      {
        apiVersion: 'helm.toolkit.fluxcd.io/v2',
        kind: 'HelmRelease',
        metadata: { name: `${CLUSTER.name}-${pool}`, namespace: 'org-lab' },
        spec: {
          chart: { spec: { chart: 'gpu-node-pool', version: '0.3.1' } },
          values: { pool: { sizes: chosen.map(shape => shape.size) } },
        },
      },
    ],
    gpuOperator: { status: 'absent' },
    serving: { status: 'absent' },
    sizes: chosen,
    presetFit,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

/** The objects a partial apply leaves for the re-run: the last three. */
export const PENDING = 3;

/** A write with `mode: apply`, cut short (`partial`) or complete: `created` or `deleted` objects. */
function writeAnswer(
  pool: string,
  partial: boolean,
  action: 'created' | 'deleted',
) {
  const all = objects(CLUSTER.name, pool, action);
  const done = partial ? all.slice(0, all.length - PENDING) : all;
  const pending = partial
    ? all
        .slice(all.length - PENDING)
        .map(object => ({ ...object, action: 'pending' }))
    : [];
  return {
    cluster: CLUSTER.name,
    namespace: CLUSTER.namespace,
    pool,
    mode: 'apply',
    dryRun: false,
    chartVersion: '0.3.1',
    kubernetesVersion: '1.31.4',
    controlPlaneVersion: 'v1.31.4',
    objects: [...done, ...pending],
    ...(partial
      ? {
          partial: true,
          nextStep: `${PENDING} of ${all.length} object(s) are pending: the answer went out within the caller's deadline instead of starting them — re-run with the same arguments, the pending objects are written first`,
        }
      : {}),
  };
}

/** `create_node_pool` with `mode: apply`: cut short (`partial`) or complete. */
export function applyAnswer(pool: string, partial: boolean) {
  return writeAnswer(pool, partial, 'created');
}

/** `delete_node_pool` with `mode: apply` on the cluster's last pool: cut short or complete. */
export function deleteAnswer(pool: string, partial: boolean) {
  return { ...writeAnswer(pool, partial, 'deleted'), lastPool: true };
}

/** `delete_node_pool`'s structured refusal (cluster-manager 0.8.1): the second text block next to the message. */
export const REFUSED = {
  nodes: ['aws:///eu-west-1a/i-0a1b2c3d4e5f60001'],
  models: [
    'LLMInferenceService model-serving/qwen3-4b-instruct (Qwen/Qwen3-4B-Instruct-2507)',
  ],
  hint: 'Karpenter removes an empty node about 10 minutes after its last pod; a served model has to be unloaded first.',
};

export const refusalText = (pool: string) =>
  `node pool ${CLUSTER.name}-${pool} still runs 1 node(s) (${REFUSED.nodes[0]}): a model is served on the cluster — unload it and re-run once the pool is empty, or pass force to delete the pool with its nodes`;

/** The reads of `list_node_pools` after an accepted delete on which the pool still reads `removing`; gone on the next. */
export const REMOVING_READS = 3;

/**
 * `list_node_pools` for a pool being removed, read `n` after the delete: the
 * shapes of cluster-manager 0.8.1's live check (`removing` at T+1 s with the
 * releases terminating, gone at T+44 s) — the pending objects shrink read by
 * read, the pool's own release last. `legacy` reports `deleting` alone.
 */
export function removingPoolAnswer(
  pool: string,
  at: number,
  n: number,
  mode: LifecycleMode,
) {
  const settled = poolAnswer(pool, at, SETTLED_READ, mode);
  const all = objects(CLUSTER.name, pool, 'terminating');
  const pending = all.slice(0, Math.max(1, all.length - (n - 1) * 3));
  return mode === 'legacy'
    ? { ...settled, deleting: true }
    : { ...settled, phase: 'removing', deleting: true, pending };
}

/** `phases`: cluster-manager 0.8's `phase`/`steps`/`readiness`; `legacy`: an older one without them. */
export type LifecycleMode = 'phases' | 'legacy';

export type StubOptions = DryRunOptions & {
  /** How many applies answer `partial` before one completes. */
  partialApplies?: number;
  /** How the lists answer once a pool is applied (default `phases`). */
  lifecycle?: LifecycleMode;
  /** A pool that exists, settled (`ready · 0 nodes`, every readiness block Ready), when the page opens. */
  existingPool?: string;
  /** `delete_node_pool` refusals before it accepts (unless `force`): 0.8.1's structured block, or an older cluster-manager's text alone. */
  refusals?: { count: number; shape: 'structured' | 'text' };
  /** Deletes cut short (`partial: true`) before one completes. */
  partialDeletes?: number;
  /**
   * More servers the lab's muster should appear to list beside cluster-manager
   * — `model-manager`, on a lab that runs none — so the Models pages take the
   * path they take on an installation with a GPU pool; their tools are stubbed
   * beside this one (`stubModelManagerTools`).
   */
  servers?: string[];
  /**
   * The cluster keeps a model cache claim when the page opens
   * (giantswarm/backstage#2493): `mounted`, its slice runs with the cache on
   * (the form's switch locks); `kept`, no slice — the claim alone stands.
   * `remove_model_cache` deletes it; the next `list_clusters` lists none.
   */
  keptCache?: 'mounted' | 'kept';
};

/** Reads after a complete apply that still answer `creating`; the next one is `ready`. */
export const CREATING_READS = 2;
/** The read from which every readiness block of the cluster is Ready. */
export const SETTLED_READ = 4;

const iso = (at: number, plusSeconds: number) =>
  new Date(at + plusSeconds * 1000).toISOString();

const SCALE_TO_ZERO =
  '0 nodes: scale-to-zero, a node launches with the first predictor';

/**
 * `list_node_pools` for the applied pool at read `n` (1-based) — the shapes of
 * cluster-manager 0.8.1's live check on gazelle (creating at T+2 s: release
 * reconciling, no MachinePool; ready 0/0 at T+31 s).
 */
export function poolAnswer(
  pool: string,
  at: number,
  n: number,
  mode: LifecycleMode,
) {
  const name = `${CLUSTER.name}-${pool}`;
  const ready = n > CREATING_READS;
  const base = {
    name,
    namespace: CLUSTER.namespace,
    version: ready ? 'v1.31.4' : '',
    controlPlaneVersion: 'v1.31.4',
    replicas: 0,
    readyReplicas: 0,
    instanceTypes: ready ? ['g6.xlarge'] : [],
    accelerator: 'nvidia-l4',
    ownerRelease: { name, namespace: CLUSTER.namespace },
  };
  if (mode === 'legacy') {
    return base;
  }
  const release =
    n <= 1
      ? {
          name: 'release',
          state: 'inProgress',
          since: iso(at, 1),
          message: `HelmRelease ${CLUSTER.namespace}/${name} reports no Ready condition yet`,
        }
      : {
          name: 'release',
          state: 'done',
          since: iso(at, 3),
          finishedAt: iso(at, 3),
          message: 'Helm install succeeded for release gpu-node-pool@0.3.1',
        };
  if (!ready) {
    return {
      ...base,
      phase: 'creating',
      steps: [
        release,
        n <= 1
          ? {
              name: 'machinePool',
              state: 'pending',
              message: 'MachinePool not created yet',
            }
          : {
              name: 'machinePool',
              state: 'inProgress',
              since: iso(at, 8),
              message: 'MachinePool not ready yet',
            },
        { name: 'nodes', state: 'pending' },
      ],
    };
  }
  return {
    ...base,
    phase: 'ready',
    steps: [
      release,
      {
        name: 'machinePool',
        state: 'done',
        since: iso(at, 14),
        finishedAt: iso(at, 14),
      },
      {
        name: 'nodes',
        state: 'done',
        since: iso(at, 14),
        finishedAt: iso(at, 14),
        message: SCALE_TO_ZERO,
      },
    ],
  };
}

/**
 * `list_clusters` for wc1 at read `n`: the pool release, then the readiness
 * blocks filling in the order gazelle showed (operator Ready at +44 s, the
 * connectivity child last, backend registered, the models Gateway Programmed).
 */
export function clusterAnswer(
  pool: string,
  at: number,
  n: number,
  mode: LifecycleMode,
) {
  const name = `${CLUSTER.name}-${pool}`;
  const poolReleases = [
    { name, namespace: CLUSTER.namespace, chartVersion: '0.3.1', ready: n > 1 },
  ];
  const operatorReady = n >= 3;
  const servingReady = n >= SETTLED_READ;
  if (mode === 'legacy') {
    return {
      ...CLUSTER,
      poolReleases,
      gpuOperator: operatorReady
        ? { status: 'present', provider: 'cluster-manager' }
        : { status: 'absent' },
      serving: servingReady
        ? { status: 'present', provider: 'cluster-manager' }
        : { status: 'absent' },
    };
  }
  const child = (
    childName: string,
    childReady: boolean,
    plusSeconds: number,
  ) => ({
    name: childName,
    namespace: CLUSTER.namespace,
    ready: childReady,
    reason: childReady ? 'InstallSucceeded' : 'Progressing',
    since: iso(at, plusSeconds),
  });
  return {
    ...CLUSTER,
    poolReleases,
    gpuOperator: {
      status: operatorReady ? 'present' : 'absent',
      provider: 'cluster-manager',
      readiness: {
        release:
          n >= 2
            ? {
                name: `${CLUSTER.name}-gpu-operator`,
                namespace: CLUSTER.namespace,
                ready: operatorReady,
                reason: operatorReady ? 'InstallSucceeded' : 'Progressing',
                since: iso(at, operatorReady ? 44 : 2),
              }
            : null,
        clusterPolicy: operatorReady
          ? { name: 'cluster-policy', state: 'ready' }
          : null,
        operands: [],
        ...(operatorReady
          ? {
              operandsMessage:
                'no operand DaemonSet: the GPU operator creates the device plugin and GPU feature discovery DaemonSets once a GPU node joins (none at scale-to-zero)',
            }
          : {}),
      },
    },
    serving: {
      status: 'present',
      provider: 'cluster-manager',
      readiness: {
        release: {
          name: `${CLUSTER.name}-agent-platform`,
          namespace: CLUSTER.namespace,
          ready: true,
          reason: 'InstallSucceeded',
          since: iso(at, 3),
        },
        children: [
          child(
            'agent-platform-connectivity',
            servingReady,
            servingReady ? 110 : 3,
          ),
          child('kserve-crd', true, 11),
          child('kserve-resources', operatorReady, operatorReady ? 69 : 11),
        ],
        controllers: [
          {
            name: 'kserve-controller-manager',
            namespace: CLUSTER.namespace,
            available: operatorReady ? 1 : 0,
            replicas: 1,
          },
          {
            name: 'llmisvc-controller-manager',
            namespace: CLUSTER.namespace,
            available: servingReady ? 1 : 0,
            replicas: 1,
          },
        ],
        configs: operatorReady ? { count: 10 } : null,
        backend:
          n >= 2
            ? {
                registered: true,
                namespace: 'agent-platform',
                name: 'model-backend-kserve',
              }
            : { registered: false },
        presets: operatorReady ? { count: 9 } : null,
        modelsGateway: servingReady
          ? {
              name: 'models',
              namespace: CLUSTER.namespace,
              ready: true,
              reason: 'Programmed',
            }
          : null,
      },
    },
  };
}

export type RecordedCall = { name: string; arguments: Record<string, unknown> };

/**
 * Make the lab's muster appear to list cluster-manager and answer its tools
 * at the browser; everything else goes through. Returns the calls the dialog
 * made, in order, for assertions on what Deploy and Continue sent.
 */
export async function stubClusterManager(
  page: Page,
  options: StubOptions = {},
): Promise<RecordedCall[]> {
  const calls: RecordedCall[] = [];
  let applies = 0;
  let deletes = 0;
  let refusals = 0;
  // The pool a complete apply created (or the existing one), and the list
  // reads since: the lists move it through the phases read by read (see
  // poolAnswer/clusterAnswer); after an accepted delete, through the teardown
  // (removingPoolAnswer) until it is gone.
  let created: { pool: string; at: number } | undefined = options.existingPool
    ? { pool: options.existingPool, at: Date.now() - 10 * 60_000 }
    : undefined;
  let reads = options.existingPool ? SETTLED_READ : 0;
  let removing: { reads: number } | undefined;
  let keptCache = options.keptCache;
  const mode: LifecycleMode = options.lifecycle ?? 'phases';

  // The page offers the dialog where the installation's muster lists
  // cluster-manager (`GET /api/muster/servers`, muster's core_mcpserver_list):
  // the lab's real list, plus that one entry.
  await page.route('**/api/muster/servers**', async route => {
    const response = await route.fetch();
    const body = (await response.json()) as {
      mcpServers?: { name: string }[] | null;
    };
    const listed = body.mcpServers ?? [];
    const added = ['cluster-manager', ...(options.servers ?? [])]
      .filter(name => !listed.some(server => server.name === name))
      .map(name => ({
        name,
        type: 'streamable-http',
        state: 'ready',
        sessionStatus: 'authenticated',
        toolsCount: name === 'cluster-manager' ? INFO.tools.length : 20,
      }));
    await route.fulfill({
      response,
      json: { ...body, mcpServers: [...listed, ...added] },
    });
  });

  // The create tool's schema (`GET /api/muster/tools/<name>`): the form reads
  // the accelerators and the arguments it may offer from it.
  await page.route(
    '**/api/muster/tools/x_cluster-manager_create_node_pool**',
    async route => {
      await route.fulfill({ json: CREATE_NODE_POOL_SCHEMA });
    },
  );

  await page.route('**/api/muster/call**', async route => {
    const body = route.request().postDataJSON() as RecordedCall;
    const tool = body?.name?.replace(/^x_cluster-manager_/, '');
    if (!body?.name || tool === body.name) {
      // Another server's tool: the next handler's (a model-manager stub
      // registered beside this one), else the lab's.
      await route.fallback();
      return;
    }
    calls.push({ name: body.name, arguments: body.arguments ?? {} });
    const args = body.arguments ?? {};
    switch (tool) {
      case 'get_info':
        await route.fulfill({ json: INFO });
        return;
      case 'list_clusters': {
        if (created) {
          reads += 1;
        }
        let cluster: unknown = CLUSTER;
        if (created) {
          cluster = clusterAnswer(created.pool, created.at, reads, mode);
        } else if (keptCache) {
          cluster = keptCacheCluster(keptCache === 'mounted');
        }
        await route.fulfill({
          json: { clusters: [cluster], clusterApi: CLUSTER_API },
        });
        return;
      }
      case 'remove_model_cache': {
        const mounted = keptCache === 'mounted';
        keptCache = undefined;
        await route.fulfill({ json: removeCacheAnswer(mounted) });
        return;
      }
      case 'list_node_pools': {
        let nodePools: unknown[] = [];
        if (created && removing) {
          removing.reads += 1;
          if (removing.reads > REMOVING_READS) {
            created = undefined;
            removing = undefined;
          } else {
            nodePools = [
              removingPoolAnswer(
                created.pool,
                created.at,
                removing.reads,
                mode,
              ),
            ];
          }
        } else if (created) {
          nodePools = [poolAnswer(created.pool, created.at, reads, mode)];
        }
        await route.fulfill({
          json: {
            cluster: CLUSTER.name,
            namespace: CLUSTER.namespace,
            controlPlaneVersion: 'v1.31.4',
            nodePools,
          },
        });
        return;
      }
      case 'delete_node_pool': {
        const pool = String(args.name);
        if (!args.force && refusals < (options.refusals?.count ?? 0)) {
          refusals += 1;
          const message = refusalText(pool);
          // The wire shape of a refused tool: muster-backend's error body, the
          // structured block as gs-node's MusterToolError `details`.
          await route.fulfill({
            status: 500,
            json: {
              error:
                options.refusals?.shape === 'structured'
                  ? {
                      name: 'MusterToolError',
                      message,
                      details: [JSON.stringify({ refused: REFUSED })],
                    }
                  : { name: 'Error', message },
            },
          });
          return;
        }
        deletes += 1;
        const partial = deletes <= (options.partialDeletes ?? 0);
        if (!partial) {
          removing = { reads: 0 };
        }
        await route.fulfill({ json: deleteAnswer(pool, partial) });
        return;
      }
      case 'create_node_pool':
        if (args.dryRun) {
          await route.fulfill({
            json: {
              ...dryRunAnswer(
                String(args.name),
                args.sizes as string[] | undefined,
                options,
              ),
              ...placementAnswer(args),
            },
          });
        } else {
          applies += 1;
          const partial = applies <= (options.partialApplies ?? 0);
          if (!partial) {
            created = { pool: String(args.name), at: Date.now() };
            reads = 0;
          }
          await route.fulfill({
            json: {
              ...applyAnswer(String(args.name), partial),
              ...placementAnswer(args),
            },
          });
        }
        return;
      default:
        await route.fulfill({
          status: 500,
          json: { error: `unexpected tool ${body.name}` },
        });
    }
  });

  return calls;
}
