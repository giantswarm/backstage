import {
  DAY,
  each,
  hex,
  isoAgo,
  MINUTE,
  type BuilderContext,
  type BuilderSettings,
  type FixtureInstallation,
  type FixtureOrganization,
} from './builders';
import { createNamer, fitName, MAX_NAME_LENGTH } from './names';

/**
 * What model hosting serves from: model-manager's backends and, beneath the
 * KServe ones, the GPU clusters cluster-manager composes pools on. Records
 * only; the agent-platform fixtures turn them into the managers' answers.
 */

const GIB = 1024 ** 3;

/**
 * A model-manager backend's kind and health: a KServe cluster, or an Ollama
 * host that answers or does not.
 */
export const MODEL_BACKEND_STATES = [
  'kserve',
  'ollama',
  'ollamaUnhealthy',
] as const;
export type ModelBackendState = (typeof MODEL_BACKEND_STATES)[number];

/** A backend model-manager runs. */
export type FixtureModelBackend = {
  installation: string;
  /** `kserve` or `ollama`, then `<kind>-<n>` for another of the kind. */
  name: string;
  kind: 'kserve' | 'ollama';
  state: ModelBackendState;
  healthy: boolean;
  /** Who registered it, as model-manager reports it. */
  source: 'static' | 'person' | 'cluster-manager';
  version: string;
  /** A host backend's base URL. */
  endpoint?: string;
  /** A KServe backend's GPU cluster. */
  cluster?: string;
};

/** A serving preset model-manager resolves on KServe (a ServingPreset). */
export type FixtureServingPreset = {
  name: string;
  displayName: string;
  /** The Hugging Face repository. */
  model: string;
  gpus: number;
  weightsBytes: number;
  overheadBytes: number;
  contextLength: number;
  capabilities: string[];
  /** The hub asks for a token to download it. */
  gated: boolean;
};

/**
 * The serving presets of every KServe backend, as model-manager ships them:
 * public models, one gated, one that needs two GPUs.
 */
export const FIXTURE_SERVING_PRESETS: readonly FixtureServingPreset[] = [
  preset(
    'qwen3-4b-instruct',
    'Qwen3 4B Instruct',
    'Qwen/Qwen3-4B-Instruct-2507',
    1,
    8,
    4,
    32768,
    ['completion', 'tools'],
  ),
  preset('qwen3-8b-fp8', 'Qwen3 8B FP8', 'Qwen/Qwen3-8B-FP8', 1, 9, 5, 32768, [
    'completion',
    'tools',
    'thinking',
  ]),
  preset(
    'llama-3-1-8b-instruct',
    'Llama 3.1 8B Instruct',
    'meta-llama/Llama-3.1-8B-Instruct',
    1,
    16,
    4,
    131072,
    ['completion', 'tools'],
    true,
  ),
  preset('gpt-oss-20b', 'gpt-oss 20B', 'openai/gpt-oss-20b', 1, 14, 6, 131072, [
    'completion',
    'tools',
    'thinking',
  ]),
  preset(
    'gemma-3-12b-it',
    'Gemma 3 12B',
    'google/gemma-3-12b-it',
    1,
    24,
    6,
    131072,
    ['completion', 'vision'],
  ),
  preset(
    'qwen3-32b-awq',
    'Qwen3 32B AWQ',
    'Qwen/Qwen3-32B-AWQ',
    1,
    19,
    8,
    32768,
    ['completion', 'tools', 'thinking'],
  ),
  preset(
    'qwen3-coder-30b-a3b',
    'Qwen3 Coder 30B A3B',
    'Qwen/Qwen3-Coder-30B-A3B-Instruct',
    2,
    61,
    12,
    262144,
    ['completion', 'tools'],
  ),
];

function preset(
  name: string,
  displayName: string,
  model: string,
  gpus: number,
  weightsGiB: number,
  overheadGiB: number,
  contextLength: number,
  capabilities: string[],
  gated = false,
): FixtureServingPreset {
  return {
    name,
    displayName,
    model,
    gpus,
    weightsBytes: weightsGiB * GIB,
    overheadBytes: overheadGiB * GIB,
    contextLength,
    capabilities,
    gated,
  };
}

/** The models an Ollama host pulls, by reference, with their size. */
export const FIXTURE_OLLAMA_MODELS: readonly {
  name: string;
  family: string;
  parameterSize: string;
  sizeBytes: number;
}[] = [
  {
    name: 'qwen3:8b',
    family: 'qwen3',
    parameterSize: '8.2B',
    sizeBytes: 5.2 * GIB,
  },
  {
    name: 'llama3.2:3b',
    family: 'llama',
    parameterSize: '3.2B',
    sizeBytes: 2.0 * GIB,
  },
  {
    name: 'gemma3:12b',
    family: 'gemma3',
    parameterSize: '12.2B',
    sizeBytes: 8.1 * GIB,
  },
  {
    name: 'mistral:7b',
    family: 'llama',
    parameterSize: '7.2B',
    sizeBytes: 4.1 * GIB,
  },
  {
    name: 'phi4:14b',
    family: 'phi3',
    parameterSize: '14.7B',
    sizeBytes: 9.1 * GIB,
  },
  {
    name: 'nomic-embed-text:latest',
    family: 'nomic-bert',
    parameterSize: '137M',
    sizeBytes: 0.27 * GIB,
  },
];

/** The accelerators of the GPU pools, with the instance types they come as. */
export const FIXTURE_ACCELERATORS: readonly {
  accelerator: string;
  product: string;
  family: string;
  gpuMemoryGiB: number;
}[] = [
  {
    accelerator: 'nvidia-l4',
    product: 'NVIDIA-L4',
    family: 'g6',
    gpuMemoryGiB: 24,
  },
  {
    accelerator: 'nvidia-a10g',
    product: 'NVIDIA-A10G',
    family: 'g5',
    gpuMemoryGiB: 24,
  },
  {
    accelerator: 'nvidia-l40s',
    product: 'NVIDIA-L40S',
    family: 'g6e',
    gpuMemoryGiB: 48,
  },
];

/** A GPU cluster cluster-manager reads, where a KServe backend serves. */
export type FixtureGpuCluster = {
  installation: string;
  name: string;
  organization: string;
  releaseVersion: string;
  zones: string[];
  /** Whether the slice serves from a model cache claim. */
  cache: boolean;
  createdAt: string;
};

/**
 * A GPU pool's lifecycle, as `list_node_pools` reports it (`phase`):
 * `failed` is a pool whose nodes never joined.
 */
export const GPU_POOL_STATES = [
  'ready',
  'scaling',
  'creating',
  'failed',
  'removing',
] as const;
export type GpuPoolState = (typeof GPU_POOL_STATES)[number];

/** A GPU node pool (a MachinePool and its release) of a cluster. */
export type FixtureGpuPool = {
  installation: string;
  cluster: string;
  /** `<cluster>-<name>`, as cluster-manager names the MachinePool. */
  name: string;
  state: GpuPoolState;
  accelerator: string;
  instanceTypes: string[];
  replicas: number;
  readyReplicas: number;
  createdAt: string;
  /** The ready nodes' names. */
  nodes: string[];
};

/** A model cache claim of a cluster's serving namespace. */
export const CACHE_CLAIM_STATES = ['mounted', 'retained', 'pending'] as const;
export type CacheClaimState = (typeof CACHE_CLAIM_STATES)[number];

export type FixtureCacheClaim = {
  installation: string;
  cluster: string;
  name: string;
  state: CacheClaimState;
  zone: string;
  capacityGiB: number;
  createdAt: string;
};

/**
 * A model on a backend. On KServe: `serving` a Ready LLMInferenceService,
 * `starting` one still coming up, `failed` one that does not, `downloaded`
 * weights in the cache and nothing serving, `downloading` a pull under way,
 * `pullFailed` a pull that failed. On Ollama `serving` is loaded, and
 * `starting` and `failed` read as `serving` and `downloaded`: a host backend
 * has no serve lifecycle.
 */
export const HOSTED_MODEL_STATES = [
  'serving',
  'starting',
  'failed',
  'downloaded',
  'downloading',
  'pullFailed',
] as const;
export type HostedModelState = (typeof HOSTED_MODEL_STATES)[number];

export type FixtureHostedModel = {
  installation: string;
  backend: string;
  /** The preset's name on KServe, the model reference on Ollama. */
  name: string;
  /** KServe: the preset it is served from. */
  preset?: string;
  state: HostedModelState;
  sizeBytes: number;
  /** KServe: the node it is served on or cached in. */
  node?: string;
  /** When it was downloaded, or the pull started. */
  modifiedAt: string;
  /** The ModelConfig model-manager wired for it, if any. */
  wired: boolean;
};

/** Model hosting's records, built after the rest of the data set. */
export type FixtureHostingData = {
  modelBackends: FixtureModelBackend[];
  gpuClusters: FixtureGpuCluster[];
  gpuPools: FixtureGpuPool[];
  cacheClaims: FixtureCacheClaim[];
  hostedModels: FixtureHostedModel[];
};

export type FixtureHostingSettings = {
  /** Per installation. */
  modelBackends?: BuilderSettings<ModelBackendState>;
  /** Per KServe backend: its cluster's pools. */
  gpuPools?: BuilderSettings<GpuPoolState>;
  /** The GPU clusters, one per KServe backend: only their names' least length. */
  gpuClusters?: { nameLength?: number };
  /** Per cluster with a cache. */
  cacheClaims?: BuilderSettings<CacheClaimState>;
  /** Per backend. */
  hostedModels?: BuilderSettings<HostedModelState>;
};

const ZONES = ['eu-central-1a', 'eu-central-1b', 'eu-central-1c'];

/**
 * model-manager's backends, their GPU clusters with pools and cache claims,
 * and their models. The base data set has a KServe and an Ollama backend in
 * each installation, the second installation's Ollama host unhealthy.
 */
export function buildHosting(
  context: BuilderContext,
  installations: readonly FixtureInstallation[],
  organizations: readonly FixtureOrganization[],
  settings: FixtureHostingSettings = {},
): FixtureHostingData {
  const name = createNamer(context.random);
  const modelBackends = each(
    installations,
    settings.modelBackends ?? {},
    {
      count: 2,
      states: ['kserve', 'ollama', 'kserve', 'ollamaUnhealthy'],
    },
    (installation, state): FixtureModelBackend => {
      const kind = state === 'kserve' ? 'kserve' : 'ollama';
      return {
        installation: installation.name,
        name: kind,
        kind,
        state,
        healthy: state !== 'ollamaUnhealthy',
        source: kind === 'kserve' ? 'cluster-manager' : 'person',
        version: kind === 'kserve' ? 'v0.15.2' : '0.12.6',
      };
    },
  );
  // A name per installation: the kind, then `<kind>-<n>`.
  const taken = new Map<string, number>();
  for (const backend of modelBackends) {
    const key = `${backend.installation}/${backend.kind}`;
    const n = (taken.get(key) ?? 0) + 1;
    taken.set(key, n);
    if (n > 1) {
      backend.name = `${backend.kind}-${n}`;
    }
  }

  const kserve = modelBackends.filter(b => b.kind === 'kserve');
  const gpuClusters = kserve.map((backend, index): FixtureGpuCluster => {
    const cluster = name(settings.gpuClusters?.nameLength).name;
    // The cluster belongs to an organization of its installation, a ready
    // one where there is one.
    const ofInstallation = organizations.filter(
      o => o.installation === backend.installation,
    );
    const organization =
      ofInstallation.find(o => o.state === 'ready') ?? ofInstallation[0];
    backend.cluster = cluster;
    return {
      installation: backend.installation,
      name: cluster,
      organization: organization?.name ?? name().name,
      releaseVersion: '31.1.0',
      zones: ZONES,
      // Every second cluster serves without a model cache.
      cache: index % 2 === 0,
      createdAt: isoAgo(context, context.random.int(30 * DAY, 200 * DAY)),
    };
  });
  for (const backend of modelBackends.filter(b => b.kind === 'ollama')) {
    backend.endpoint = `http://${backend.name}.${backend.installation}.example.com:11434`;
  }

  const gpuPools = each(
    gpuClusters,
    settings.gpuPools ?? {},
    { count: 3, states: GPU_POOL_STATES },
    (cluster, state, nameLength, index): FixtureGpuPool => {
      // A cluster's first pool is the roomy one, L40S nodes, so a model can
      // be served next to what runs already.
      const first = index % (settings.gpuPools?.count ?? 3) === 0;
      const accelerator = first
        ? FIXTURE_ACCELERATORS[FIXTURE_ACCELERATORS.length - 1]
        : context.random.pick(FIXTURE_ACCELERATORS);
      const size = context.random.pick(['xlarge', '2xlarge', '4xlarge']);
      // A roomy or scaling pool runs two nodes at least, so one is up.
      const least = first || state === 'scaling' ? 2 : 1;
      const replicas = state === 'failed' ? 1 : context.random.int(least, 3);
      const readyReplicas = readyOf(state, replicas);
      const pool = fitName(
        `${cluster.name}-${name(Math.max(nameLength - cluster.name.length - 1, 0)).name}`,
        MAX_NAME_LENGTH,
      );
      return {
        installation: cluster.installation,
        cluster: cluster.name,
        name: pool,
        state,
        accelerator: accelerator.accelerator,
        instanceTypes: [`${accelerator.family}.${size}`],
        replicas,
        readyReplicas,
        createdAt: isoAgo(
          context,
          state === 'creating'
            ? context.random.int(MINUTE, 10 * MINUTE)
            : context.random.int(DAY, 30 * DAY),
        ),
        nodes: Array.from(
          { length: readyReplicas },
          () =>
            `ip-10-0-${context.random.int(1, 254)}-${context.random.int(1, 254)}.${hex(context, 4)}.internal`,
        ),
      };
    },
  );

  const cacheClaims = each(
    gpuClusters.filter(c => c.cache),
    settings.cacheClaims ?? {},
    { count: 3, states: CACHE_CLAIM_STATES },
    (cluster, state): FixtureCacheClaim => ({
      installation: cluster.installation,
      cluster: cluster.name,
      name: `hf-cache-${hex(context, 5)}`,
      state,
      zone: context.random.pick(cluster.zones),
      capacityGiB: context.random.pick([100, 200, 500]),
      createdAt: isoAgo(context, context.random.int(DAY, 120 * DAY)),
    }),
  );
  // One mounted claim per cluster, `hf-cache` as the slice names it: the
  // first; another one taking the state is kept instead.
  const seen = new Set<string>();
  for (const claim of cacheClaims) {
    const key = `${claim.installation}/${claim.cluster}`;
    if (claim.state === 'mounted' && seen.has(key)) {
      claim.state = 'retained';
    }
    if (claim.state === 'mounted') {
      seen.add(key);
      claim.name = 'hf-cache';
    }
  }

  const made = new Map<FixtureModelBackend, number>();
  const hostedModels = each(
    modelBackends,
    settings.hostedModels ?? {},
    {
      count: 5,
      states: [
        'serving',
        'starting',
        'downloaded',
        'failed',
        'downloading',
        'downloaded',
        'serving',
        'pullFailed',
      ],
    },
    (backend, stated, nameLength): FixtureHostedModel => {
      const index = made.get(backend) ?? 0;
      made.set(backend, index + 1);
      const state = onBackend(backend, stated);
      const ready = gpuPools
        .filter(
          p =>
            p.installation === backend.installation &&
            p.cluster === backend.cluster,
        )
        .flatMap(p => p.nodes);
      const node =
        backend.kind === 'kserve' && ready.length > 0
          ? ready[index % ready.length]
          : undefined;
      const suffix = (base: string) =>
        nameLength > base.length
          ? fitName(
              `${base}-${name(nameLength - base.length - 1).name}`,
              MAX_NAME_LENGTH,
            )
          : base;
      if (backend.kind === 'kserve') {
        const served =
          FIXTURE_SERVING_PRESETS[index % FIXTURE_SERVING_PRESETS.length];
        const round = Math.floor(index / FIXTURE_SERVING_PRESETS.length);
        const model = suffix(
          round ? `${served.name}-${round + 1}` : served.name,
        );
        return {
          installation: backend.installation,
          backend: backend.name,
          name: model,
          preset: served.name,
          state,
          sizeBytes: served.weightsBytes,
          node,
          modifiedAt: isoAgo(context, context.random.int(MINUTE, 20 * DAY)),
          wired: state === 'serving',
        };
      }
      const pulled =
        FIXTURE_OLLAMA_MODELS[index % FIXTURE_OLLAMA_MODELS.length];
      const round = Math.floor(index / FIXTURE_OLLAMA_MODELS.length);
      return {
        installation: backend.installation,
        backend: backend.name,
        name: suffix(
          round ? pulled.name.replace(':', `-${round + 1}:`) : pulled.name,
        ),
        state,
        sizeBytes: pulled.sizeBytes,
        modifiedAt: isoAgo(context, context.random.int(MINUTE, 20 * DAY)),
        wired: state === 'serving' || state === 'downloaded',
      };
    },
  );

  return { modelBackends, gpuClusters, gpuPools, cacheClaims, hostedModels };
}

/** The nodes of a pool that are up: all of a running pool, all but one scaling, none else. */
function readyOf(state: GpuPoolState, replicas: number): number {
  if (state === 'ready' || state === 'removing') {
    return replicas;
  }
  return state === 'scaling' ? replicas - 1 : 0;
}

/** A state as the backend's kind has it: a host backend has no serve lifecycle. */
function onBackend(
  backend: FixtureModelBackend,
  state: HostedModelState,
): HostedModelState {
  if (backend.kind === 'kserve') {
    return state;
  }
  if (state === 'starting') {
    return 'serving';
  }
  return state === 'failed' ? 'downloaded' : state;
}
