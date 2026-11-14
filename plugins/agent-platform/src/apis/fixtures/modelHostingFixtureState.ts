import {
  baseDataSet,
  hashOf,
  isUnreachableInstallation,
  unreachableInstallationError,
  FIXTURE_ACCELERATORS,
  FIXTURE_OLLAMA_MODELS,
  FIXTURE_SERVING_PRESETS,
  type FixtureCacheClaim,
  type FixtureDataSet,
  type FixtureGpuCluster,
  type FixtureGpuPool,
  type FixtureModelBackend,
  type FixtureServingPreset,
} from '@giantswarm/backstage-plugin-gs-common/fixtures';

import {
  CLUSTER_MANAGER_TOOLS,
  type CacheClaim,
  type ClusterApiStatus,
  type ClusterManagerInfo,
  type InstanceShape,
  type ManagedCluster,
  type NodePool,
  type NodePoolsResult,
  type NodePoolWriteResult,
  type ObjectAction,
  type PoolPhase,
  type PresetSizeFit,
} from '../../lib/clusterManager';
import type {
  ModelManagerFitResult,
  ModelManagerJob,
  ModelManagerPlacement,
} from '../../lib/modelManager';
import type {
  AddBackendResult,
  BackendKind,
  RemoveBackendResult,
} from '../../lib/modelManagerBackends';
import { SETTLE_MS } from './agentManagerFixtureState';

const GIB = 1024 ** 3;

/** How long a pull runs, from its start to the model in the inventory. */
export const PULL_MS = 3 * SETTLE_MS;

/** A serve's phases on KServe, in order; an in-session serve takes one per half a settle. */
const SERVE_STEPS = [
  'scheduling',
  'nodeStarting',
  'downloadingWeights',
  'pullingImage',
  'loading',
  'routing',
  'ready',
] as const;
const STEP_MS = SETTLE_MS / 2;

/** Where model-manager keeps its backend documents. */
const MODEL_MANAGER_NAMESPACE = 'model-manager';
/** Where model-manager wires its ModelConfigs. */
const WIRING_NAMESPACE = 'kagent';
const SERVING_NAMESPACE = 'model-serving';
const KUBERNETES_VERSION = '1.33.4';
const POOL_CHART_VERSION = '1.4.0';
const PRICE_SOURCE = 'EU (Frankfurt) (eu-central-1)';
const PRICE_AS_OF = '2026-11-01';
const GP3_USD_PER_GIB_MONTH = 0.0952;
const POOL_NAME = /^[a-z0-9][-a-z0-9]{3,18}[a-z0-9]$/;
const DEFAULT_SIZES = ['xlarge', '2xlarge', '4xlarge'];

/** The accelerators cluster-manager's `create_node_pool` takes. */
export const FIXTURE_POOL_ACCELERATORS = [
  'nvidia-l4',
  'nvidia-a10g',
  'nvidia-t4',
  'nvidia-l40s',
] as const;

/** EC2 sizes per family: vCPUs, memory, GPUs, the hourly list price in Frankfurt. */
const INSTANCE_SIZES: Record<
  string,
  Record<string, [vcpu: number, memoryGiB: number, gpus: number, usd: number]>
> = {
  g6: {
    xlarge: [4, 16, 1, 0.98],
    '2xlarge': [8, 32, 1, 1.18],
    '4xlarge': [16, 64, 1, 1.6],
    '12xlarge': [48, 192, 4, 5.62],
  },
  g5: {
    xlarge: [4, 16, 1, 1.23],
    '2xlarge': [8, 32, 1, 1.48],
    '4xlarge': [16, 64, 1, 1.98],
    '12xlarge': [48, 192, 4, 6.94],
  },
  g4dn: {
    xlarge: [4, 16, 1, 0.66],
    '2xlarge': [8, 32, 1, 0.94],
    '4xlarge': [16, 64, 1, 1.5],
    '12xlarge': [48, 192, 4, 4.89],
  },
  g6e: {
    xlarge: [4, 32, 1, 2.24],
    '2xlarge': [8, 64, 1, 2.7],
    '4xlarge': [16, 128, 1, 3.62],
    '12xlarge': [48, 384, 4, 12.6],
  },
};
const ACCELERATORS: Record<
  string,
  { product: string; family: string; gpuMemoryGiB: number }
> = {
  ...Object.fromEntries(
    FIXTURE_ACCELERATORS.map(a => [a.accelerator, a] as const),
  ),
  'nvidia-t4': { product: 'Tesla-T4', family: 'g4dn', gpuMemoryGiB: 16 },
};

/**
 * Further repositories of the fixture Hugging Face Hub, beside the presets'
 * models: no preset serves them, so importing one judges it by its weights.
 */
const HUB_MODELS: readonly {
  id: string;
  weightsGiB: number;
  downloads: number;
  likes: number;
  gated?: boolean;
}[] = [
  {
    id: 'Qwen/Qwen2.5-7B-Instruct',
    weightsGiB: 15,
    downloads: 1_830_000,
    likes: 790,
  },
  {
    id: 'mistralai/Mistral-7B-Instruct-v0.3',
    weightsGiB: 14,
    downloads: 1_120_000,
    likes: 1840,
    gated: true,
  },
  {
    id: 'microsoft/Phi-4-mini-instruct',
    weightsGiB: 8,
    downloads: 410_000,
    likes: 520,
  },
  {
    id: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B',
    weightsGiB: 15,
    downloads: 960_000,
    likes: 690,
  },
  {
    id: 'Qwen/Qwen3-235B-A22B-Instruct-2507',
    weightsGiB: 438,
    downloads: 210_000,
    likes: 650,
  },
];

/** The Cluster API, as cluster-manager finds it served. */
const CLUSTER_API: ClusterApiStatus = {
  group: 'cluster.x-k8s.io',
  version: 'v1beta1',
  state: 'served',
};

/** The fixture Hugging Face Hub: the presets' models and a few more. */
const HUB: readonly {
  id: string;
  weightsBytes: number;
  downloads: number;
  likes: number;
  gated: boolean;
}[] = (() => {
  const presets = FIXTURE_SERVING_PRESETS.filter(
    (p, i, all) => all.findIndex(o => o.model === p.model) === i,
  ).map((p, i) => ({
    id: p.model,
    weightsBytes: p.weightsBytes,
    downloads: 2_400_000 - i * 210_000,
    likes: 1200 - i * 90,
    gated: p.gated,
  }));
  return [
    ...presets,
    ...HUB_MODELS.map(m => ({
      id: m.id,
      weightsBytes: m.weightsGiB * GIB,
      downloads: m.downloads,
      likes: m.likes,
      gated: Boolean(m.gated),
    })),
  ];
})();

/** model-manager's refusal, worded as its MCP tools answer it: `<code>: <error>`. */
function refusal(code: string, message: string): Error {
  return new Error(`${code}: ${message}`);
}
const notFound = (what: string) =>
  refusal('not_found', `model not found: ${what}`);
const invalid = (what: string) =>
  refusal('invalid_request', `invalid request: ${what}`);
const conflict = (what: string) => refusal('conflict', `conflict: ${what}`);
const unsupported = (what: string) =>
  refusal('unsupported', `operation not supported: ${what}`);

/**
 * cluster-manager's refusal: the text, and the structured block the portal
 * reads beside it (`{"refused": …}`, `{"notFound": …}`), as muster carries a
 * tool error's further text contents in `details`.
 */
function clusterRefusal(text: string, block?: Record<string, unknown>): Error {
  return Object.assign(new Error(text), {
    details: block ? [text, JSON.stringify(block)] : [text],
  });
}

function gib(bytes: number): string {
  return `${(bytes / GIB).toFixed(1)} GiB`;
}

type ServedState = 'serving' | 'starting' | 'failed' | 'downloaded';

/** A model a backend holds: in the cache or on the host, served or not. */
type Model = {
  backend: string;
  name: string;
  preset?: string;
  state: ServedState;
  sizeBytes: number;
  node?: string;
  nodes?: string[];
  placement?: ModelManagerPlacement;
  modifiedAt: string;
  wired: boolean;
  /** Whether the weights are in the cache (KServe) or on the host. */
  cached: boolean;
  /** An in-session serve: when it started, so its phases move on. */
  servedAt?: number;
};

type Job = {
  id: string;
  backend: string;
  model: string;
  /** `running` jobs of the data set stay where they are. */
  phase: ModelManagerJob['phase'];
  frozenPercent?: number;
  createdAt: number;
  finishedAt?: number;
  bytesTotal: number;
  node?: string;
  preset?: string;
  wire: boolean;
  error?: string;
};

type Pool = Omit<FixtureGpuPool, 'createdAt'> & {
  createdAt: number;
  /** An in-session delete: when it started. */
  removingSince?: number;
  /** Created in this session: it comes up after a while. The data set's stay as they are. */
  launched?: boolean;
};

type Cluster = FixtureGpuCluster & { backend?: string };

type InstallationState = {
  backends: FixtureModelBackend[];
  models: Model[];
  jobs: Job[];
  clusters: Cluster[];
  pools: Pool[];
  claims: FixtureCacheClaim[];
};

type Node = {
  name: string;
  backend: string;
  cluster: string;
  pool: string;
  accelerator: string;
  gpus: number;
  gpuMemoryBytes: number;
  allocatableMemoryBytes: number;
  budgetBytes: number;
};

/**
 * model-manager's and cluster-manager's state in fixture mode, from the data
 * set (`baseDataSet().modelBackends`, `gpuClusters`, `gpuPools`,
 * `cacheClaims`, `hostedModels`): the backends with their models, nodes,
 * presets and pulls, and the GPU clusters with their pools and model cache.
 * The two managers share it, as on an installation: the nodes model-manager
 * places models on are the ready nodes of cluster-manager's pools, and the
 * first pool of a cluster registers its KServe backend. Writes are kept in
 * memory until the page reloads; pulls, serves, new pools and removals move
 * on with time. Every method answers what the tool answers, as JSON values,
 * and refuses in the managers' own words.
 */
export class ModelHostingFixtureState {
  private readonly installations = new Map<string, InstallationState>();
  private nextJob = 1;

  constructor(
    private readonly data: FixtureDataSet,
    private readonly now: () => number = Date.now,
  ) {}

  private of(installation: string): InstallationState {
    let state = this.installations.get(installation);
    if (!state) {
      const byInstallation = <T extends { installation: string }>(
        items: readonly T[],
      ) => items.filter(item => item.installation === installation);
      const backends = byInstallation(this.data.modelBackends).map(b => ({
        ...b,
      }));
      const clusters = byInstallation(this.data.gpuClusters).map(c => ({
        ...c,
        backend: backends.find(b => b.cluster === c.name)?.name,
      }));
      // KServe weights stay only in a cluster's model cache: without one a
      // model is served or not there at all.
      const cacheless = new Set(
        backends
          .filter(
            b =>
              b.kind === 'kserve' &&
              !clusters.find(c => c.name === b.cluster)?.cache,
          )
          .map(b => b.name),
      );
      const hosted = byInstallation(this.data.hostedModels).filter(
        m => !(cacheless.has(m.backend) && m.state === 'downloaded'),
      );
      const created = (iso: string) => Date.parse(iso);
      state = {
        backends,
        clusters,
        pools: byInstallation(this.data.gpuPools).map(p => ({
          ...p,
          createdAt: created(p.createdAt),
        })),
        claims: byInstallation(this.data.cacheClaims).map(c => ({ ...c })),
        models: hosted
          .filter(m => m.state !== 'downloading' && m.state !== 'pullFailed')
          .map(m => ({
            backend: m.backend,
            name: m.name,
            preset: m.preset,
            state: m.state as ServedState,
            sizeBytes: m.sizeBytes,
            node: m.node,
            modifiedAt: m.modifiedAt,
            wired: m.wired,
            cached: m.state !== 'starting' && !cacheless.has(m.backend),
          })),
        jobs: hosted
          .filter(m => m.state === 'downloading' || m.state === 'pullFailed')
          .map(m => {
            const backend = backends.find(b => b.name === m.backend);
            const kserve = backend?.kind === 'kserve';
            return {
              id: this.jobId(),
              backend: m.backend,
              model: kserve ? (presetOf(m.preset)?.model ?? m.name) : m.name,
              phase:
                m.state === 'downloading'
                  ? ('running' as const)
                  : ('failed' as const),
              frozenPercent: m.state === 'downloading' ? 42 : undefined,
              createdAt: created(m.modifiedAt),
              ...(m.state === 'pullFailed' && {
                finishedAt: created(m.modifiedAt) + PULL_MS,
                error: kserve
                  ? `download ${m.name}: 401 Unauthorized: a token with access to the repository is required`
                  : `pull model manifest: file does not exist`,
              }),
              bytesTotal: m.sizeBytes,
              node: m.node,
              preset: m.preset,
              wire: !kserve,
            };
          }),
      };
      this.installations.set(installation, state);
      this.place(state);
    }
    this.settle(state);
    return state;
  }

  /**
   * Seats the data set's serves as model-manager would have: each on its
   * node while it has room, else on one that has, else not served at all
   * (the weights stay in the cache).
   */
  private place(state: InstallationState): void {
    const serves = state.models
      .filter(m => m.state === 'serving' || m.state === 'starting')
      .map(model => ({ model, state: model.state }));
    for (const { model } of serves) {
      model.state = 'downloaded';
    }
    for (const serve of serves) {
      const { model } = serve;
      const backend = state.backends.find(b => b.name === model.backend);
      const preset = presetOf(model.preset);
      if (backend?.kind !== 'kserve' || !preset) {
        model.state = serve.state;
        continue;
      }
      const required = preset.weightsBytes + preset.overheadBytes;
      const room = (node: Node) =>
        node.gpus >= preset.gpus &&
        node.budgetBytes - this.reserved(state, node) >= required;
      const nodes = this.nodes(state, backend);
      const node =
        nodes.find(n => n.name === model.node && room(n)) ?? nodes.find(room);
      if (node) {
        model.node = node.name;
        model.state = serve.state;
      } else if (!model.cached) {
        // Neither served nor in a cache: model-manager would not list it.
        state.models.splice(state.models.indexOf(model), 1);
      }
    }
  }

  private jobId(): string {
    return `job-${String(this.nextJob++).padStart(4, '0')}`;
  }

  /** What time has done since the last read: pulls finished, serves ready, pools up or gone. */
  private settle(state: InstallationState): void {
    const now = this.now();
    for (const job of state.jobs) {
      if (
        job.phase === 'running' &&
        job.frozenPercent === undefined &&
        now - job.createdAt >= PULL_MS
      ) {
        job.phase = 'succeeded';
        job.finishedAt = job.createdAt + PULL_MS;
        this.landPull(state, job);
      }
    }
    for (const model of state.models) {
      if (
        model.state === 'starting' &&
        model.servedAt !== undefined &&
        now - model.servedAt >= STEP_MS * (SERVE_STEPS.length - 1)
      ) {
        model.state = 'serving';
        model.cached = true;
      }
    }
    for (const pool of state.pools) {
      if (
        pool.launched &&
        pool.state === 'creating' &&
        now - pool.createdAt >= 2 * SETTLE_MS
      ) {
        pool.state = 'ready';
        // Its first node: the pool comes up with one, so a model can be served on it.
        pool.replicas = 1;
        pool.readyReplicas = 1;
        pool.nodes = [
          `${pool.name}-${hashOf(pool.name).toString(16).slice(0, 5)}.ec2.internal`,
        ];
      }
    }
    const gone = state.pools.filter(
      p =>
        p.removingSince !== undefined && now - p.removingSince >= 2 * SETTLE_MS,
    );
    for (const pool of gone) {
      state.pools.splice(state.pools.indexOf(pool), 1);
      const cluster = state.clusters.find(c => c.name === pool.cluster);
      const left = state.pools.some(p => p.cluster === pool.cluster);
      if (cluster?.backend && !left) {
        // The cluster's last pool takes its backend registration with it.
        this.dropBackend(state, cluster.backend);
        cluster.backend = undefined;
      }
    }
  }

  private landPull(state: InstallationState, job: Job): void {
    const backend = state.backends.find(b => b.name === job.backend);
    if (!backend) {
      return;
    }
    const preset =
      backend.kind === 'kserve'
        ? FIXTURE_SERVING_PRESETS.find(
            p => p.name === job.preset || p.model === job.model,
          )
        : undefined;
    const name = preset?.name ?? job.model;
    if (state.models.some(m => m.backend === backend.name && m.name === name)) {
      return;
    }
    state.models.push({
      backend: backend.name,
      name,
      preset: preset?.name,
      state: 'downloaded',
      sizeBytes: job.bytesTotal,
      node: job.node,
      modifiedAt: new Date(job.finishedAt ?? this.now()).toISOString(),
      wired: job.wire,
      cached: true,
    });
  }

  private dropBackend(state: InstallationState, name: string): void {
    state.backends = state.backends.filter(b => b.name !== name);
    state.models = state.models.filter(m => m.backend !== name);
    state.jobs = state.jobs.filter(j => j.backend !== name);
  }

  // model-manager

  private backend(
    state: InstallationState,
    name: string | undefined,
    operation: string,
    offers: (b: FixtureModelBackend) => boolean,
  ): FixtureModelBackend {
    if (name) {
      const named = state.backends.find(b => b.name === name);
      if (!named) {
        throw invalid(
          `unknown backend ${JSON.stringify(name)} (configured: ${state.backends.map(b => b.name).join(', ')})`,
        );
      }
      if (!offers(named)) {
        throw unsupported(`${operation} on ${named.name}`);
      }
      return named;
    }
    const offering = state.backends.filter(offers);
    if (offering.length === 0) {
      if (state.backends.length === 0) {
        throw refusal('no_backend', 'no backend registered');
      }
      throw unsupported(`${operation} on ${state.backends[0].name}`);
    }
    if (offering.length > 1 && operation === 'fit check') {
      throw conflict(
        `several backends offer fit checks (${offering.map(b => b.name).join(', ')}); name the backend`,
      );
    }
    return offering[0];
  }

  /** The backend a model reference is on, as model-manager resolves it without a name. */
  private holder(
    state: InstallationState,
    reference: string,
    name: string | undefined,
  ): FixtureModelBackend {
    if (!reference) {
      throw invalid('model name is required');
    }
    if (name) {
      return this.backend(state, name, 'model', () => true);
    }
    const on = state.backends.filter(b =>
      state.models.some(m => m.backend === b.name && m.name === reference),
    );
    if (on.length === 0) {
      throw notFound(
        `${reference} is on none of the backends (${state.backends.map(b => b.name).join(', ')})`,
      );
    }
    if (on.length > 1) {
      throw conflict(
        `${reference} exists on ${on.map(b => b.name).join(', ')}; name the backend`,
      );
    }
    return on[0];
  }

  private reachable(backend: FixtureModelBackend): void {
    if (!backend.healthy) {
      throw refusal(
        'unavailable',
        `backend unavailable: ${downMessage(backend)}`,
      );
    }
  }

  private descriptor(
    state: InstallationState,
    backend: FixtureModelBackend,
  ): Record<string, unknown> {
    const kserve = backend.kind === 'kserve';
    return {
      backend: backend.name,
      backends: state.backends.map(b => b.name),
      ...(backend.healthy && { version: backend.version }),
      ...(backend.endpoint && {
        endpoint: backend.endpoint,
        agentEndpoint: backend.endpoint,
      }),
      healthy: backend.healthy,
      ...(!backend.healthy && { message: downMessage(backend) }),
      source: backend.source,
      ...(kserve &&
        backend.cluster && {
          target: {
            cluster: backend.cluster,
            servingNamespace: SERVING_NAMESPACE,
          },
        }),
      capabilities: {
        pull: true,
        pullProgress: true,
        delete: true,
        load: true,
        unload: true,
        loadedModels: true,
        wire: true,
        presets: kserve,
        fitCheck: kserve,
        nodeInventory: true,
        search: kserve,
      },
      wiring: {
        namespace: WIRING_NAMESPACE,
        apiVersion: 'kagent.dev/v1alpha2',
        autoWire: !kserve,
      },
      loading: kserve
        ? { onDemand: false, idleEviction: false }
        : {
            onDemand: true,
            idleEviction: true,
            keepAliveDefault: '5m',
            keepAliveScope: 'request',
          },
    };
  }

  listBackends(installation: string): Record<string, unknown> {
    const state = this.of(installation);
    return {
      backends: state.backends.map(b => this.descriptor(state, b)),
      ...(state.backends.length === 0 && {
        backendsReason:
          'no backend registered: add one with add_backend, or create a GPU node pool with cluster-manager',
      }),
    };
  }

  getBackend(installation: string, name?: string): Record<string, unknown> {
    const state = this.of(installation);
    const backend = this.backend(state, name, 'backend', () => true);
    return this.descriptor(state, backend);
  }

  /** The backends an aggregate read covers, and the failures of those that do not answer. */
  private covered(
    state: InstallationState,
    name: string | undefined,
  ): { backends: FixtureModelBackend[]; errors?: Record<string, string> } {
    const scope = name
      ? [this.backend(state, name, 'list', () => true)]
      : state.backends;
    if (name) {
      this.reachable(scope[0]);
    }
    const down = scope.filter(b => !b.healthy);
    return {
      backends: scope.filter(b => b.healthy),
      ...(down.length > 0 && {
        errors: Object.fromEntries(
          down.map(b => [b.name, `backend unavailable: ${downMessage(b)}`]),
        ),
      }),
    };
  }

  listModels(installation: string, name?: string): Record<string, unknown> {
    const state = this.of(installation);
    const { backends, errors } = this.covered(state, name);
    return {
      models: state.models
        .filter(m => backends.some(b => b.name === m.backend))
        .map(m => this.modelOf(state, m)),
      ...(errors && { errors }),
    };
  }

  listLoaded(installation: string, name?: string): Record<string, unknown> {
    const state = this.of(installation);
    const { backends, errors } = this.covered(state, name);
    return {
      loaded: state.models
        .filter(
          m =>
            m.state !== 'downloaded' &&
            backends.some(b => b.name === m.backend),
        )
        .map(m => this.runningOf(state, m)),
      ...(errors && { errors }),
    };
  }

  listNodes(installation: string, name?: string): Record<string, unknown> {
    const state = this.of(installation);
    const { backends, errors } = this.covered(state, name);
    return {
      nodes: backends.flatMap(b => this.nodeAnswers(state, b)),
      ...(errors && { errors }),
    };
  }

  listPresets(installation: string, name?: string): Record<string, unknown> {
    const state = this.of(installation);
    this.backend(state, name, 'presets', b => b.kind === 'kserve');
    return {
      presets: FIXTURE_SERVING_PRESETS.map(p => ({
        name: p.name,
        displayName: p.displayName,
        description: `${p.displayName}, served with vLLM.`,
        source: 'shipped',
        model: p.model,
        storageUri: `hf://${p.model}`,
        format: 'safetensors',
        runtime: 'vllm',
        contextLength: p.contextLength,
        capabilities: p.capabilities,
        gpus: p.gpus,
        weightsBytes: p.weightsBytes,
        overheadBytes: p.overheadBytes,
        requiredBytes: p.weightsBytes + p.overheadBytes,
      })),
    };
  }

  searchModels(
    installation: string,
    args: { query: string; limit?: number; backend?: string },
  ): Record<string, unknown> {
    const state = this.of(installation);
    this.backend(state, args.backend, 'search', b => b.kind === 'kserve');
    const query = args.query.trim().toLowerCase();
    if (!query) {
      throw invalid('query is required');
    }
    const results = HUB.filter(m => m.id.toLowerCase().includes(query))
      .sort((a, b) => b.downloads - a.downloads)
      .slice(0, args.limit ?? 20)
      .map(m => ({
        id: m.id,
        author: m.id.split('/')[0],
        downloads: m.downloads,
        likes: m.likes,
        gated: m.gated,
        private: false,
        pipelineTag: 'text-generation',
        library: 'transformers',
        tags: [
          'transformers',
          'safetensors',
          'text-generation',
          'conversational',
        ],
        lastModified: '2026-09-30T08:00:00Z',
        presets: FIXTURE_SERVING_PRESETS.filter(p => p.model === m.id).map(
          p => p.name,
        ),
      }));
    return { results };
  }

  /** The nodes of a backend: the ready nodes of its cluster's pools, or its host. */
  private nodes(
    state: InstallationState,
    backend: FixtureModelBackend,
  ): Node[] {
    if (backend.kind !== 'kserve') {
      return [
        {
          name: hostOf(backend),
          backend: backend.name,
          cluster: '',
          pool: '',
          accelerator: '',
          gpus: 0,
          gpuMemoryBytes: 0,
          allocatableMemoryBytes: 64 * GIB,
          budgetBytes: 48 * GIB,
        },
      ];
    }
    return state.pools
      .filter(
        p =>
          p.cluster === backend.cluster &&
          p.removingSince === undefined &&
          p.state !== 'removing',
      )
      .flatMap(pool => {
        const accelerator = ACCELERATORS[pool.accelerator];
        const [, size] = pool.instanceTypes[0].split('.');
        const [, memoryGiB, gpus] = INSTANCE_SIZES[accelerator.family]?.[
          size
        ] ?? [4, 16, 1, 0];
        const gpuMemoryBytes = accelerator.gpuMemoryGiB * GIB;
        return pool.nodes.map(node => ({
          name: node,
          backend: backend.name,
          cluster: pool.cluster,
          pool: pool.name,
          accelerator: pool.accelerator,
          gpus,
          gpuMemoryBytes,
          allocatableMemoryBytes: memoryGiB * GIB * 0.9,
          budgetBytes: Math.round(gpuMemoryBytes * gpus * 0.9),
        }));
      });
  }

  /** What the models served on a node reserve of its budget. */
  private reserved(state: InstallationState, node: Node): number {
    return state.models
      .filter(
        m =>
          m.backend === node.backend &&
          m.state !== 'downloaded' &&
          (m.node === node.name || m.nodes?.includes(node.name)),
      )
      .reduce((sum, m) => {
        const preset = presetOf(m.preset);
        const required = preset
          ? preset.weightsBytes + preset.overheadBytes
          : m.sizeBytes;
        // A split shares the model across its nodes; copies hold it whole on each.
        return (
          sum +
          (m.placement === 'split' && m.nodes
            ? required / m.nodes.length
            : required)
        );
      }, 0);
  }

  private nodeAnswers(
    state: InstallationState,
    backend: FixtureModelBackend,
  ): Record<string, unknown>[] {
    const cluster = state.clusters.find(c => c.name === backend.cluster);
    const mounted = state.claims.find(
      c => c.cluster === backend.cluster && c.state === 'mounted',
    );
    return this.nodes(state, backend).map(node => {
      const reserved = this.reserved(state, node);
      const host = backend.kind !== 'kserve';
      const cached = state.models.filter(
        m =>
          m.backend === backend.name &&
          m.cached &&
          (host || m.node === node.name),
      );
      return {
        name: node.name,
        backend: backend.name,
        ready: true,
        architecture: 'amd64',
        allocatableMemoryBytes: node.allocatableMemoryBytes,
        gpuCount: node.gpus,
        ...(host
          ? {
              budgetSource: 'host-meminfo',
              accelerated: reserved > 0,
              message:
                'The budget is the memory of the host Ollama runs on; Ollama does not report its GPUs.',
            }
          : {
              gpuMemoryBytes: node.gpuMemoryBytes,
              gpuProduct: ACCELERATORS[node.accelerator].product,
              budgetSource: 'gpu-labels',
              eligible: true,
              fastLink: `${node.pool}-efa`,
            }),
        budgetBytes: node.budgetBytes,
        reservedBytes: Math.round(reserved),
        freeBytes: Math.max(Math.round(node.budgetBytes - reserved), 0),
        ...((host || (cluster?.cache && mounted)) && {
          cache: {
            claim: host ? undefined : mounted?.name,
            mountPath: host ? '/root/.ollama/models' : '/models',
            models: cached.length,
            bytesUsed: cached.reduce((sum, m) => sum + m.sizeBytes, 0),
            scannedAt: new Date(this.now() - 60_000).toISOString(),
            shared: false,
          },
        }),
      };
    });
  }

  private modelConfigOf(
    state: InstallationState,
    model: Model,
  ): Record<string, unknown> | undefined {
    if (!model.wired) {
      return undefined;
    }
    const backend = state.backends.find(b => b.name === model.backend);
    const kserve = backend?.kind === 'kserve';
    return {
      name: `${model.backend}-${model.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`,
      namespace: WIRING_NAMESPACE,
      apiVersion: 'kagent.dev/v1alpha2',
      provider: kserve ? 'OpenAI' : 'Ollama',
      model: model.name,
      providerModel: model.name,
      endpoint: kserve ? endpointOf(model) : backend?.endpoint,
      managed: true,
      ready: model.state === 'serving' || !kserve,
      backend: model.backend,
    };
  }

  /** A served model as `list_loaded_models` and a model's `running` read it. */
  private runningOf(
    state: InstallationState,
    model: Model,
  ): Record<string, unknown> {
    const backend = state.backends.find(b => b.name === model.backend);
    if (backend?.kind !== 'kserve') {
      return {
        name: model.name,
        backend: model.backend,
        sizeBytes: model.sizeBytes,
        vramBytes: Math.round(model.sizeBytes * 0.8),
        contextLength: 8192,
        expiresAt: new Date(this.now() + 5 * 60_000).toISOString(),
        status: 'loaded',
      };
    }
    const preset = presetOf(model.preset);
    const steps = this.stepsOf(model);
    const failed = model.state === 'failed';
    const ready = model.state === 'serving';
    const phase = failed
      ? 'failed'
      : (steps.find(s => s.state !== 'done')?.name ?? 'ready');
    return {
      name: model.name,
      backend: model.backend,
      endpoint: endpointOf(model),
      node: model.node,
      ...(model.placement && { placement: model.placement }),
      ...(model.nodes && { nodes: model.nodes }),
      status: servedStatus(model.state),
      ...(failed && {
        reason: 'CrashLoopBackOff',
        message: `CrashLoopBackOff back-off restarting failed container main in pod ${model.name}-kserve-0: CUDA out of memory`,
      }),
      resource: model.name,
      kind: 'LLMInferenceService',
      preset: model.preset,
      gpus: preset?.gpus ?? 1,
      managedBy: 'model-manager',
      phase,
      steps,
      ...(ready && {
        runtime: { name: 'vllm', version: '0.11.0' },
        interfaces: [
          { type: 'Completions', path: '/v1/chat/completions' },
          { type: 'Responses', path: '/v1/responses' },
        ],
      }),
    };
  }

  private stepsOf(model: Model): Record<string, unknown>[] {
    const now = this.now();
    // The data set's serves stand at a fixed step: still downloading, or failed loading.
    let reached: number = SERVE_STEPS.indexOf('downloadingWeights');
    if (model.state === 'serving') {
      reached = SERVE_STEPS.length - 1;
    } else if (model.servedAt !== undefined) {
      reached = Math.min(
        Math.floor((now - model.servedAt) / STEP_MS),
        SERVE_STEPS.length - 1,
      );
    } else if (model.state === 'failed') {
      reached = SERVE_STEPS.indexOf('loading');
    }
    const start = model.servedAt ?? Date.parse(model.modifiedAt);
    return SERVE_STEPS.map((name, index) => {
      const since = new Date(start + index * STEP_MS).toISOString();
      if (index < reached || (index === reached && name === 'ready')) {
        return {
          name,
          state: 'done',
          since,
          finishedAt: new Date(start + (index + 1) * STEP_MS).toISOString(),
          ...(name === 'downloadingWeights' && {
            bytesTotal: model.sizeBytes,
            bytesCompleted: model.sizeBytes,
            cached: model.cached,
          }),
        };
      }
      if (index === reached) {
        return {
          name,
          state: model.state === 'failed' ? 'failed' : 'inProgress',
          since,
          ...(name === 'downloadingWeights' && {
            bytesTotal: model.sizeBytes,
            bytesCompleted: Math.round(model.sizeBytes * 0.37),
          }),
          ...(model.state === 'failed' && {
            reason: 'CrashLoopBackOff',
            message: 'the predictor exited: CUDA out of memory',
          }),
        };
      }
      return { name, state: 'pending' };
    });
  }

  private modelOf(
    state: InstallationState,
    model: Model,
  ): Record<string, unknown> {
    const backend = state.backends.find(b => b.name === model.backend);
    const kserve = backend?.kind === 'kserve';
    const preset = presetOf(model.preset);
    const pulled = FIXTURE_OLLAMA_MODELS.find(m => m.name === model.name);
    const served = model.state !== 'downloaded';
    return {
      name: model.name,
      backend: model.backend,
      digest: `sha256:${digestOf(model.name)}`,
      sizeBytes: model.sizeBytes,
      modifiedAt: model.modifiedAt,
      format: kserve ? 'safetensors' : 'gguf',
      family:
        pulled?.family ??
        preset?.model.split('/')[1].split('-')[0].toLowerCase(),
      ...(pulled && {
        parameterSize: pulled.parameterSize,
        quantization: 'Q4_K_M',
      }),
      contextLength: preset?.contextLength ?? 8192,
      capabilities: preset?.capabilities ?? ['completion'],
      ...(kserve && {
        node: model.node,
        downloaded: model.cached,
        path: model.preset,
        preset: model.preset,
      }),
      loaded: served,
      ...(served && { running: this.runningOf(state, model) }),
      ...(model.wired && { modelConfig: this.modelConfigOf(state, model) }),
    };
  }

  /**
   * `check_fit`: the preset's (or the hub's) weights and overhead against a
   * node's budget, the copies on one node or the split across several.
   */
  checkFit(
    installation: string,
    request: {
      model?: string;
      preset?: string;
      node?: string;
      nodes?: string[];
      placement?: ModelManagerPlacement;
      backend?: string;
    },
  ): ModelManagerFitResult {
    const state = this.of(installation);
    const backend = this.backend(
      state,
      request.backend,
      'fit check',
      b => b.kind === 'kserve',
    );
    this.reachable(backend);
    return this.fit(state, backend, request);
  }

  private fit(
    state: InstallationState,
    backend: FixtureModelBackend,
    request: {
      model?: string;
      preset?: string;
      node?: string;
      nodes?: string[];
      placement?: ModelManagerPlacement;
    },
  ): ModelManagerFitResult {
    if (!request.model && !request.preset) {
      throw invalid('model or preset is required');
    }
    const preset = FIXTURE_SERVING_PRESETS.find(
      p =>
        p.name === request.preset ||
        p.name === request.model ||
        p.model === request.model,
    );
    const hub = HUB.find(m => m.id === (preset?.model ?? request.model));
    if (!preset && !hub) {
      throw notFound(
        `${request.model ?? request.preset} on the Hugging Face Hub`,
      );
    }
    const model = preset?.model ?? hub!.id;
    const weightsBytes = preset?.weightsBytes ?? hub!.weightsBytes;
    const overheadBytes = preset?.overheadBytes ?? 4 * GIB;
    const requiredBytes = weightsBytes + overheadBytes;
    const nodes = this.nodes(state, backend);
    const free = (node: Node) => node.budgetBytes - this.reserved(state, node);
    const presets = FIXTURE_SERVING_PRESETS.filter(p => p.model === model).map(
      p => p.name,
    );
    const servingNodes = state.models
      .filter(
        m =>
          m.backend === backend.name &&
          m.state !== 'downloaded' &&
          m.preset === preset?.name &&
          m.node,
      )
      .map(m => m.node!);
    const cached = state.models.some(
      m =>
        m.backend === backend.name &&
        m.cached &&
        m.preset === preset?.name &&
        preset,
    );
    const pool = state.pools.find(p => p.cluster === backend.cluster);
    const common = {
      model,
      ...(preset && { preset: preset.name }),
      presets,
      weightsBytes,
      weightsSource: preset ? 'preset' : 'safetensors-index',
      overheadBytes,
      requiredBytes,
      downloadBytes: cached ? 0 : weightsBytes,
      servingNodes,
      budgetSource: 'gpu-labels',
      gated: Boolean(preset?.gated ?? hub?.gated),
      private: false,
      tokenConfigured: true,
      cached,
      cacheSource: 'scan',
      recommended:
        (preset?.gpus ?? 1) > 1 ? ('split' as const) : ('copies' as const),
    };
    if (nodes.length === 0) {
      return {
        ...common,
        fits: false,
        reason: pool
          ? `no node of ${backend.name} is up: the pool ${pool.name} launches a ${pool.instanceTypes[0]} when the model is served`
          : `no GPU node pool serves ${backend.name}: add one first`,
        ...(pool && { instanceType: pool.instanceTypes[0] }),
      } as ModelManagerFitResult;
    }
    if (request.placement === 'split') {
      const named = request.nodes?.length
        ? nodes.filter(n => request.nodes!.includes(n.name))
        : nodes;
      if (named.length === 0) {
        throw invalid(
          `none of the nodes ${request.nodes!.join(', ')} is a node of ${backend.name}`,
        );
      }
      const tightest = named.reduce((a, b) => (free(a) <= free(b) ? a : b));
      const share = requiredBytes / named.length;
      const fits = named.length > 1 && named.every(n => free(n) >= share);
      const splitReason = () => {
        if (fits) {
          return `${gib(share)} per node of ${named.length} fits ${gib(free(tightest))} free on the tightest, ${tightest.name}`;
        }
        return named.length < 2
          ? 'a split needs two nodes or more on one fast link'
          : `${gib(share)} per node does not fit ${gib(free(tightest))} free on ${tightest.name}`;
      };
      return {
        ...common,
        fits,
        placement: 'split',
        nodes: named.map(n => n.name),
        node: named[0].name,
        fastLink: `${tightest.pool}-efa`,
        budgetBytes: tightest.budgetBytes,
        reservedBytes: Math.round(this.reserved(state, tightest)),
        freeBytes: Math.round(free(tightest)),
        reason: splitReason(),
        recommendedNodes: named.map(n => n.name),
      } as ModelManagerFitResult;
    }
    // Copies: the nodes named (one copy on each), the node named, or the
    // roomiest; each must have the preset's GPUs and the room for it.
    const gpus = preset?.gpus ?? 1;
    let targets: Node[];
    if (request.nodes?.length) {
      targets = nodes.filter(n => request.nodes!.includes(n.name));
    } else if (request.node) {
      targets = nodes.filter(n => n.name === request.node);
    } else {
      targets = [nodes.reduce((a, b) => (free(a) >= free(b) ? a : b))];
    }
    if (targets.length === 0) {
      throw invalid(
        `node ${request.node ?? request.nodes?.join(', ')} is not a node of ${backend.name}`,
      );
    }
    const short = (node: Node) => {
      if (node.gpus < gpus) {
        return `${node.name} has ${node.gpus} GPU(s), the preset needs ${gpus}`;
      }
      if (requiredBytes > free(node)) {
        return `${gib(requiredBytes)} (weights ${gib(weightsBytes)} + overhead ${gib(overheadBytes)}) does not fit ${gib(free(node))} free of ${gib(node.budgetBytes)} on ${node.name}`;
      }
      return undefined;
    };
    const refused = targets.map(short).find(Boolean);
    const node = targets[0];
    return {
      ...common,
      fits: !refused,
      placement: 'copies',
      node: node.name,
      ...(targets.length > 1 && { nodes: targets.map(n => n.name) }),
      budgetBytes: node.budgetBytes,
      reservedBytes: Math.round(this.reserved(state, node)),
      freeBytes: Math.round(free(node)),
      instanceType: state.pools.find(p => p.name === node.pool)
        ?.instanceTypes[0],
      reason:
        refused ??
        `${gib(requiredBytes)} (weights ${gib(weightsBytes)} + overhead ${gib(overheadBytes)}) fits ${gib(free(node))} free of ${gib(node.budgetBytes)} on ${targets.map(n => n.name).join(', ')}`,
      recommendedNodes: targets.map(n => n.name),
    } as ModelManagerFitResult;
  }

  pullModel(
    installation: string,
    request: {
      model: string;
      wire?: boolean;
      preset?: string;
      node?: string;
      backend?: string;
      mode?: string;
    },
  ): Record<string, unknown> {
    const state = this.of(installation);
    if (request.mode === 'commit') {
      throw unsupported(
        'mode commit on pull_model: a download lands in a cache, not in a repository; use mode apply',
      );
    }
    const backend = this.backend(state, request.backend, 'pull', () => true);
    this.reachable(backend);
    if (!request.model) {
      throw invalid('model reference is required');
    }
    if (backend.kind === 'kserve' && request.wire) {
      throw invalid(
        `models on ${backend.name} are wired when loaded (served), not when pulled`,
      );
    }
    let node = request.node;
    let preset = request.preset;
    let bytesTotal: number;
    if (backend.kind === 'kserve') {
      const fit = this.fit(state, backend, {
        model: request.model,
        preset: request.preset,
        node: request.node,
      });
      if (!fit.fits) {
        throw refusal('does_not_fit', `model does not fit: ${fit.reason}`);
      }
      node = fit.node;
      preset = fit.preset;
      bytesTotal = fit.weightsBytes ?? 0;
    } else {
      bytesTotal =
        FIXTURE_OLLAMA_MODELS.find(m => m.name === request.model)?.sizeBytes ??
        4 * GIB;
    }
    const running = state.jobs.find(
      j =>
        j.backend === backend.name &&
        j.model === request.model &&
        j.phase === 'running',
    );
    if (running) {
      return { job: this.jobOf(running), created: false };
    }
    const job: Job = {
      id: this.jobId(),
      backend: backend.name,
      model: request.model,
      phase: 'running',
      createdAt: this.now(),
      bytesTotal,
      node: backend.kind === 'kserve' ? node : undefined,
      preset: backend.kind === 'kserve' ? preset : undefined,
      wire: backend.kind === 'kserve' ? false : (request.wire ?? true),
    };
    state.jobs.unshift(job);
    return { job: this.jobOf(job), created: true };
  }

  private jobOf(job: Job): ModelManagerJob {
    const elapsed = this.now() - job.createdAt;
    const percent =
      job.phase === 'succeeded'
        ? 100
        : (job.frozenPercent ??
          (job.phase === 'running'
            ? Math.min(Math.floor((elapsed / PULL_MS) * 100), 99)
            : 0));
    return {
      id: job.id,
      backend: job.backend,
      type: 'pull',
      model: job.model,
      phase: job.phase,
      status: jobStatus(job.phase, percent),
      bytesCompleted: Math.round((job.bytesTotal * percent) / 100),
      bytesTotal: job.bytesTotal,
      percent,
      ...(job.error && { error: job.error }),
      createdAt: new Date(job.createdAt).toISOString(),
      startedAt: new Date(job.createdAt).toISOString(),
      ...(job.finishedAt && {
        finishedAt: new Date(job.finishedAt).toISOString(),
      }),
      wire: job.wire,
      ...(job.node && { node: job.node }),
      ...(job.preset && { preset: job.preset }),
    } as ModelManagerJob;
  }

  listJobs(installation: string, name?: string): Record<string, unknown> {
    const state = this.of(installation);
    return {
      jobs: state.jobs
        .filter(j => !name || j.backend === name)
        .map(j => this.jobOf(j)),
    };
  }

  private job(state: InstallationState, id: string): Job {
    const job = state.jobs.find(j => j.id === id);
    if (!job) {
      throw refusal('not_found', `job not found: ${id}`);
    }
    return job;
  }

  getJob(installation: string, id: string): ModelManagerJob {
    return this.jobOf(this.job(this.of(installation), id));
  }

  cancelJob(installation: string, id: string): ModelManagerJob {
    const state = this.of(installation);
    const job = this.job(state, id);
    if (job.phase === 'running' || job.phase === 'pending') {
      job.phase = 'cancelled';
      job.finishedAt = this.now();
    }
    return this.jobOf(job);
  }

  /**
   * `load_model`: on KServe the preset served on a node that fits (refused
   * when none does), answering the model with the fit it was judged by and
   * its first phase; the preset served already answers `alreadyServing`. On
   * Ollama the model loaded into memory.
   */
  loadModel(
    installation: string,
    request: {
      model?: string;
      preset?: string;
      node?: string;
      nodes?: string[];
      placement?: ModelManagerPlacement;
      keepAlive?: string;
      backend?: string;
      mode?: string;
    },
  ): Record<string, unknown> {
    const state = this.of(installation);
    if (!request.model && !request.preset) {
      throw invalid('model or preset is required');
    }
    if (request.mode === 'commit') {
      throw unsupported(
        'mode commit (a pull request opened as you) is not offered by this server: it is not registered with its GitHub App (chart value github.enabled), so it holds no GitHub authorization of yours — use mode apply',
      );
    }
    let backend: FixtureModelBackend;
    if (request.backend) {
      backend = this.backend(state, request.backend, 'load', () => true);
    } else if (request.preset) {
      backend = this.backend(
        state,
        undefined,
        'load',
        b => b.kind === 'kserve',
      );
    } else {
      backend = this.holder(state, request.model!, undefined);
    }
    this.reachable(backend);
    if (backend.kind !== 'kserve') {
      const model = state.models.find(
        m => m.backend === backend.name && m.name === request.model,
      );
      if (!model) {
        throw notFound(`${request.model}`);
      }
      model.state = 'serving';
      return this.modelOf(state, model);
    }
    // A failed serve is replaced: what it holds of its node does not count
    // against the new one.
    const failed = state.models.find(
      m =>
        m.backend === backend.name &&
        m.state === 'failed' &&
        (m.name === request.preset || m.name === request.model),
    );
    if (failed) {
      failed.state = 'downloaded';
    }
    let fit: ModelManagerFitResult;
    try {
      fit = this.fit(state, backend, request);
    } finally {
      if (failed) {
        failed.state = 'failed';
      }
    }
    const preset = presetOf(fit.preset);
    if (!preset) {
      throw invalid(
        `no serving preset serves ${request.model}: import it with a preset`,
      );
    }
    const existing = state.models.find(
      m => m.backend === backend.name && m.name === preset.name,
    );
    // A failed serve is served again; one up or coming up is answered as it is.
    if (
      existing &&
      (existing.state === 'serving' || existing.state === 'starting')
    ) {
      return {
        ...this.modelOf(state, existing),
        alreadyServing: true,
        servingNodes: existing.nodes ?? (existing.node ? [existing.node] : []),
      };
    }
    if (!fit.fits) {
      throw refusal('does_not_fit', `model does not fit: ${fit.reason}`);
    }
    const model: Model = existing ?? {
      backend: backend.name,
      name: preset.name,
      preset: preset.name,
      state: 'starting',
      sizeBytes: preset.weightsBytes,
      modifiedAt: new Date(this.now()).toISOString(),
      wired: true,
      cached: false,
    };
    model.state = 'starting';
    model.servedAt = this.now();
    model.wired = true;
    model.node = fit.node;
    model.placement = fit.placement;
    model.nodes = fit.nodes?.length ? fit.nodes : undefined;
    if (!existing) {
      state.models.push(model);
    }
    return { ...this.modelOf(state, model), fit };
  }

  unloadModel(
    installation: string,
    request: { model: string; backend?: string },
  ): Record<string, unknown> {
    const state = this.of(installation);
    const backend = this.holder(state, request.model, request.backend);
    this.reachable(backend);
    const model = state.models.find(
      m => m.backend === backend.name && m.name === request.model,
    );
    if (backend.kind === 'kserve') {
      if (!model || model.state === 'downloaded') {
        throw notFound(`no LLMInferenceService serves ${request.model}`);
      }
      if (model.cached) {
        model.state = 'downloaded';
        model.servedAt = undefined;
        model.nodes = undefined;
        model.placement = undefined;
      } else {
        state.models.splice(state.models.indexOf(model), 1);
      }
    } else if (model) {
      model.state = 'downloaded';
    }
    return { model: request.model, backend: backend.name, unloaded: true };
  }

  deleteModel(
    installation: string,
    request: { model: string; unwire?: boolean; backend?: string },
  ): Record<string, unknown> {
    const state = this.of(installation);
    const backend = this.holder(state, request.model, request.backend);
    this.reachable(backend);
    const model = state.models.find(
      m => m.backend === backend.name && m.name === request.model,
    );
    if (!model || (backend.kind === 'kserve' && !model.cached)) {
      throw notFound(`${request.model} is not in the cache`);
    }
    if (backend.kind === 'kserve' && model.state !== 'downloaded') {
      throw conflict(
        `${model.name} is served by LLMInferenceService ${model.name}; unload it first`,
      );
    }
    state.models.splice(state.models.indexOf(model), 1);
    return {
      model: request.model,
      backend: backend.name,
      deleted: true,
      ...(model.wired && request.unwire !== false && { unwired: true }),
    };
  }

  /** The model a call names on its backend, or model-manager's `not_found`. */
  private modelOn(
    state: InstallationState,
    reference: string,
    name: string | undefined,
  ): Model {
    const backend = this.holder(state, reference, name);
    const model = state.models.find(
      m => m.backend === backend.name && m.name === reference,
    );
    if (!model) {
      throw notFound(`${reference} is not on ${backend.name}`);
    }
    return model;
  }

  wireModel(
    installation: string,
    request: { model: string; backend?: string },
  ): Record<string, unknown> {
    const state = this.of(installation);
    const model = this.modelOn(state, request.model, request.backend);
    model.wired = true;
    return { modelConfig: this.modelConfigOf(state, model) };
  }

  unwireModel(
    installation: string,
    request: { model: string; backend?: string },
  ): Record<string, unknown> {
    const state = this.of(installation);
    const model = this.modelOn(state, request.model, request.backend);
    if (!model.wired) {
      throw notFound(
        `no ModelConfig of model-manager's wires ${request.model}`,
      );
    }
    model.wired = false;
    return { model: request.model, backend: model.backend, unwired: true };
  }

  /** Whether `tryModel` reaches a model the installation serves: Ready on KServe, loaded on a host. */
  tryModel(installation: string, model: string): { ready: boolean } {
    if (isUnreachableInstallation(this.data, installation)) {
      throw unreachableInstallationError(installation);
    }
    const state = this.of(installation);
    return {
      ready: state.models.some(m => m.name === model && m.state === 'serving'),
    };
  }

  /**
   * `add_backend`: the backend document rendered, and on apply registered at
   * once; a name the chart configures is refused, as is mode commit.
   */
  addBackend(
    installation: string,
    args: Record<string, unknown>,
  ): AddBackendResult {
    const state = this.of(installation);
    const get = (key: string) => String(args[key] ?? '').trim();
    if (get('mode') === 'commit') {
      throw unsupported(
        'mode commit (a pull request through the broker grant) is not available yet; use mode apply',
      );
    }
    const kind = get('kind') as BackendKind;
    if (!kind) {
      throw invalid('spec.kind: required (kserve, lemonade, lmstudio, ollama)');
    }
    if (!['ollama', 'lmstudio', 'lemonade', 'kserve'].includes(kind)) {
      throw invalid(
        `spec.kind: unknown ${JSON.stringify(kind)} (kserve, lemonade, lmstudio, ollama)`,
      );
    }
    const name = get('name') || kind;
    const host = kind !== 'kserve';
    if (host && !get('endpoint')) {
      throw invalid(`spec.endpoint: required for ${kind}`);
    }
    if (!host && !get('servingNamespace')) {
      throw invalid('spec.kserve.target.servingNamespace: required');
    }
    const existing = state.backends.find(b => b.name === name);
    if (existing?.source === 'static') {
      throw conflict(
        `backend ${name} is configured statically by the chart values (--backends); remove it there to register it at runtime`,
      );
    }
    const configMap = {
      namespace: MODEL_MANAGER_NAMESPACE,
      name: `model-backend-${name}`,
      labels: { 'model-manager.giantswarm.io/backend': 'true' },
    };
    const document = [
      'apiVersion: model-manager.giantswarm.io/v1alpha1',
      'kind: ModelBackend',
      'metadata:',
      `  name: ${name}`,
      'spec:',
      `  kind: ${kind}`,
      `  source: ${get('source') || 'person'}`,
      ...(host
        ? [
            `  endpoint: ${get('endpoint')}`,
            ...(get('agentEndpoint')
              ? [`  agentEndpoint: ${get('agentEndpoint')}`]
              : []),
          ]
        : [
            '  kserve:',
            '    target:',
            `      cluster: ${get('cluster') || 'local'}`,
            `      servingNamespace: ${get('servingNamespace')}`,
          ]),
      '',
    ].join('\n');
    if (args.dryRun === true) {
      return { dryRun: true, document, configMap };
    }
    const backend: FixtureModelBackend = {
      installation,
      name,
      kind: kind === 'kserve' ? 'kserve' : 'ollama',
      state: kind === 'kserve' ? 'kserve' : 'ollama',
      healthy: true,
      source: 'person',
      version: kind === 'kserve' ? 'v0.15.2' : '0.12.6',
      ...(host && { endpoint: get('endpoint') }),
      ...(!host &&
        get('cluster') &&
        get('cluster') !== 'local' && {
          cluster: get('cluster'),
        }),
    };
    if (existing) {
      state.backends.splice(state.backends.indexOf(existing), 1, backend);
    } else {
      state.backends.push(backend);
    }
    // A KServe backend for one of cluster-manager's GPU clusters serves its
    // pools: the cluster reports it registered, and its next pool keeps it.
    const cluster = state.clusters.find(c => c.name === backend.cluster);
    if (cluster) {
      cluster.backend = backend.name;
    }
    const descriptor = this.descriptor(state, backend);
    return {
      dryRun: false,
      document,
      configMap,
      created: !existing,
      registered: true,
      backend: {
        backend: name,
        endpoint: descriptor.endpoint as string | undefined,
        healthy: true,
      },
    };
  }

  /** `remove_backend`: its ModelConfigs unwired and its document deleted; the chart's refused. */
  removeBackend(
    installation: string,
    args: Record<string, unknown>,
  ): RemoveBackendResult {
    const state = this.of(installation);
    if (args.mode === 'commit') {
      throw unsupported(
        'mode commit (a pull request through the broker grant) is not available yet; use mode apply',
      );
    }
    const name = String(args.name ?? args.kind ?? '').trim();
    if (!name) {
      throw invalid('name is required');
    }
    const backend = state.backends.find(b => b.name === name);
    if (backend?.source === 'static') {
      throw conflict(
        `backend ${name} is configured statically by the chart values (--backends) and cannot be removed here`,
      );
    }
    const configMap = {
      namespace: MODEL_MANAGER_NAMESPACE,
      name: `model-backend-${name}`,
    };
    const wired = state.models
      .filter(m => m.backend === name && m.wired)
      .map(m => this.modelConfigOf(state, m)!.name as string);
    if (args.dryRun === true) {
      return { dryRun: true, configMap, modelConfigs: wired };
    }
    if (!backend) {
      throw notFound(
        `no ${name} backend document in ${MODEL_MANAGER_NAMESPACE}`,
      );
    }
    this.dropBackend(state, name);
    for (const cluster of state.clusters.filter(c => c.backend === name)) {
      cluster.backend = undefined;
    }
    return {
      dryRun: false,
      configMap,
      unwired: wired,
      removed: true,
      deregistered: true,
    };
  }

  // cluster-manager

  clusterManagerInfo(): ClusterManagerInfo {
    return {
      version: '0.25.0',
      modes: { apply: true, commit: false },
      // The Clusters page's writes are not served (`create_cluster`,
      // `delete_cluster`), so the portal does not offer them.
      tools: Object.values(CLUSTER_MANAGER_TOOLS).filter(
        tool =>
          tool !== CLUSTER_MANAGER_TOOLS.createCluster &&
          tool !== CLUSTER_MANAGER_TOOLS.deleteCluster,
      ),
      clusterApi: CLUSTER_API,
    };
  }

  private cluster(
    state: InstallationState,
    name: string,
    namespace?: string,
  ): Cluster {
    const cluster = state.clusters.find(
      c => c.name === name && (!namespace || namespaceOf(c) === namespace),
    );
    if (!cluster) {
      throw clusterRefusal(
        `cluster ${namespace ? `${namespace}/` : ''}${name} not found: list_clusters names the clusters you may see`,
      );
    }
    return cluster;
  }

  private claimAnswer(cluster: Cluster, claim: FixtureCacheClaim): CacheClaim {
    return {
      namespace: SERVING_NAMESPACE,
      name: claim.name,
      phase: claim.state === 'pending' ? 'Pending' : 'Bound',
      ...(claim.state !== 'pending' && {
        volume: `pvc-${digestOf(`${cluster.name}/${claim.name}`).slice(0, 8)}`,
        zone: claim.zone,
      }),
      capacity: `${claim.capacityGiB}Gi`,
      capacityGiB: claim.capacityGiB,
      storageClass: 'gp3',
      tier: { type: 'gp3', iops: 3000, throughputMiBps: 125 },
      reclaimPolicy: claim.state === 'retained' ? 'Retain' : 'Delete',
      created: claim.createdAt,
      price: {
        monthlyUSD:
          Math.round(claim.capacityGiB * GP3_USD_PER_GIB_MONTH * 100) / 100,
        source: `AWS EBS gp3 list price, ${PRICE_SOURCE}`,
        asOf: PRICE_AS_OF,
      },
      mounted: claim.state === 'mounted',
    };
  }

  private clusterAnswer(
    state: InstallationState,
    cluster: Cluster,
  ): ManagedCluster {
    const namespace = namespaceOf(cluster);
    const pools = state.pools.filter(p => p.cluster === cluster.name);
    const nodes = pools.reduce((sum, p) => sum + p.readyReplicas, 0);
    const claims = state.claims.filter(c => c.cluster === cluster.name);
    const since = cluster.createdAt;
    const sliceRelease = `${cluster.name}-agent-platform`;
    return {
      name: cluster.name,
      namespace,
      organization: cluster.organization,
      releaseVersion: cluster.releaseVersion,
      ownCluster: false,
      gpuOperator: {
        status: 'present',
        provider: 'cluster-manager',
        evidence: [`HelmRelease ${namespace}/${cluster.name}-gpu-operator`],
        readiness: {
          release: {
            name: `${cluster.name}-gpu-operator`,
            namespace,
            ready: true,
            since,
          },
          clusterPolicy: { name: 'cluster-policy', state: 'ready' },
          operands:
            nodes > 0
              ? ['nvidia-device-plugin-daemonset', 'nvidia-dcgm-exporter'].map(
                  name => ({
                    name,
                    namespace: 'gpu-operator',
                    desired: nodes,
                    ready: nodes,
                  }),
                )
              : [],
          ...(nodes === 0 && {
            operandsMessage:
              'no GPU node runs: the operands start with the first node of a pool',
          }),
        },
      },
      serving: {
        status: 'present',
        provider: 'cluster-manager',
        evidence: [`HelmRelease ${namespace}/${sliceRelease}`],
        readiness: {
          release: { name: sliceRelease, namespace, ready: true, since },
          children: [
            {
              name: `${cluster.name}-kserve`,
              namespace,
              ready: true,
              since,
            },
          ],
          controllers: [
            {
              name: 'llmisvc-controller-manager',
              namespace: 'kserve',
              available: 1,
              replicas: 1,
            },
          ],
          configs: { count: FIXTURE_SERVING_PRESETS.length },
          backend: {
            registered: Boolean(cluster.backend),
            namespace: MODEL_MANAGER_NAMESPACE,
            name: `model-backend-${cluster.backend ?? 'kserve'}`,
          },
          presets: { count: FIXTURE_SERVING_PRESETS.length },
          modelsGateway: {
            name: 'models',
            namespace: SERVING_NAMESPACE,
            ready: true,
          },
          cache: cluster.cache
            ? {
                enabled: true,
                claim:
                  claims.find(c => c.state === 'mounted')?.name ?? 'hf-cache',
              }
            : { enabled: false },
          cacheClaims: claims.map(c => this.claimAnswer(cluster, c)),
        },
      },
      poolReleases: pools.map(p => ({
        name: p.name,
        namespace,
        chartVersion: POOL_CHART_VERSION,
        ready: releaseReady(p.state),
      })),
      zones: cluster.zones,
      commitTarget: null,
    };
  }

  listClusters(installation: string): Record<string, unknown> {
    const state = this.of(installation);
    return {
      clusters: state.clusters.map(c => this.clusterAnswer(state, c)),
      clusterApi: CLUSTER_API,
    };
  }

  listNodePools(
    installation: string,
    args: { cluster: string; namespace?: string },
  ): NodePoolsResult {
    const state = this.of(installation);
    const cluster = this.cluster(state, args.cluster, args.namespace);
    const namespace = namespaceOf(cluster);
    return {
      cluster: cluster.name,
      namespace,
      controlPlaneVersion: KUBERNETES_VERSION,
      nodePools: state.pools
        .filter(p => p.cluster === cluster.name)
        .map(p => this.poolAnswer(p, namespace)),
    };
  }

  private poolAnswer(pool: Pool, namespace: string): NodePool {
    const phase: PoolPhase =
      pool.removingSince !== undefined ? 'removing' : pool.state;
    const since = new Date(pool.createdAt).toISOString();
    const done = (name: string) => ({
      name,
      state: 'done' as const,
      since,
      finishedAt: since,
    });
    let steps: NodePool['steps'] = [
      done('release'),
      done('machinePool'),
      phase === 'scaling'
        ? { name: 'nodes', state: 'inProgress', since }
        : done('nodes'),
    ];
    if (phase === 'creating') {
      steps = [
        done('release'),
        { name: 'machinePool', state: 'inProgress', since },
        { name: 'nodes', state: 'pending' },
      ];
    } else if (phase === 'failed') {
      steps = [
        done('release'),
        done('machinePool'),
        {
          name: 'nodes',
          state: 'failed',
          since,
          message: `no ${pool.instanceTypes[0]} capacity in the pool's zones: InsufficientInstanceCapacity`,
        },
      ];
    }
    return {
      name: pool.name,
      namespace,
      version: KUBERNETES_VERSION,
      controlPlaneVersion: KUBERNETES_VERSION,
      replicas: pool.replicas,
      readyReplicas: pool.readyReplicas,
      instanceTypes: pool.instanceTypes,
      accelerator: pool.accelerator,
      ownerRelease: { name: pool.name, namespace },
      phase,
      steps,
      deleting: phase === 'removing',
    };
  }

  private sizesOf(accelerator: string, sizes: string[]): InstanceShape[] {
    const spec = ACCELERATORS[accelerator];
    return sizes.map(size => {
      const [vcpu, memoryGiB, gpus, usd] = INSTANCE_SIZES[spec.family]?.[
        size
      ] ?? [4, 16, 1, 1];
      return {
        instanceType: `${spec.family}.${size}`,
        size,
        vcpu,
        memoryGiB,
        gpus,
        gpuMemoryGiB: spec.gpuMemoryGiB,
        usableVcpu: vcpu - 0.4,
        usableMemoryGiB: Math.round(memoryGiB * 0.86 * 10) / 10,
        pricePerHourUSD: usd,
        priceSource: `AWS EC2 on-demand Linux list price, ${PRICE_SOURCE}`,
        priceAsOf: PRICE_AS_OF,
      };
    });
  }

  /**
   * `create_node_pool`: the pool's release composed from the cluster, priced
   * per size with the presets each hosts; on apply the pool is created (or
   * updated) and, as the cluster's first, registers its KServe backend.
   */
  createNodePool(
    installation: string,
    args: Record<string, unknown>,
  ): NodePoolWriteResult {
    const state = this.of(installation);
    const mode = String(args.mode ?? 'apply');
    if (mode === 'commit') {
      throw clusterRefusal(
        'mode commit: this cluster-manager opens no pull requests (get_info modes.commit is false) — use mode apply',
      );
    }
    const cluster = this.cluster(
      state,
      String(args.cluster ?? ''),
      args.namespace as string | undefined,
    );
    const name = String(args.name ?? '');
    if (!POOL_NAME.test(name)) {
      throw clusterRefusal(
        `name ${JSON.stringify(name)}: five to twenty lowercase characters, digits and dashes, starting and ending with a letter or digit`,
      );
    }
    const accelerator = String(
      args.accelerator ?? FIXTURE_POOL_ACCELERATORS[0],
    );
    if (!Object.hasOwn(ACCELERATORS, accelerator)) {
      throw clusterRefusal(
        `accelerator ${JSON.stringify(accelerator)}: one of ${FIXTURE_POOL_ACCELERATORS.join(', ')}`,
      );
    }
    const sizes =
      Array.isArray(args.sizes) && args.sizes.length > 0
        ? (args.sizes as string[])
        : DEFAULT_SIZES;
    const namespace = namespaceOf(cluster);
    const poolName = `${cluster.name}-${name}`;
    const existing = state.pools.find(p => p.name === poolName);
    const dryRun = args.dryRun === true;
    const shapes = this.sizesOf(accelerator, sizes);
    const largest = shapes.reduce((a, b) =>
      a.gpus * a.gpuMemoryGiB >= b.gpus * b.gpuMemoryGiB ? a : b,
    );
    const presets: PresetSizeFit[] = FIXTURE_SERVING_PRESETS.map(p => {
      const needGiB = (p.weightsBytes + p.overheadBytes) / GIB;
      const host = shapes.find(
        s => s.gpus >= p.gpus && s.gpus * s.gpuMemoryGiB * 0.9 >= needGiB,
      );
      return {
        preset: p.name,
        displayName: p.displayName,
        model: p.model,
        cpu: '4',
        memory: '24Gi',
        gpus: p.gpus,
        gpuMemoryGiB: Math.round(needGiB * 10) / 10,
        ...(host
          ? { size: host.size }
          : {
              reason: `needs ${needGiB.toFixed(1)} GiB of GPU memory on ${p.gpus} GPU(s); the largest size, ${largest.instanceType}, has ${largest.gpus * largest.gpuMemoryGiB} GiB`,
            }),
      };
    });
    const cacheOn =
      typeof args.cache === 'boolean' ? args.cache : cluster.cache;
    const mounted = state.claims.find(
      c => c.cluster === cluster.name && c.state === 'mounted',
    );
    const chosen =
      Array.isArray(args.zones) && args.zones.length > 0
        ? (args.zones as string[])
        : undefined;
    const pinned = cacheOn && mounted ? [mounted.zone] : undefined;
    const zones = chosen ?? pinned ?? cluster.zones;
    let zonesNote = "every zone of the cluster's node subnets";
    if (chosen) {
      zonesNote = 'the zones you chose';
    } else if (pinned && mounted) {
      zonesNote = `the model cache's zone: the predictors mount ${mounted.name}, whose volume is in ${mounted.zone}`;
    }
    const backendName =
      cluster.backend ??
      (state.backends.some(b => b.name === 'kserve')
        ? `kserve-${cluster.name}`
        : 'kserve');
    const verb = (exists: boolean) => {
      if (dryRun) {
        return exists ? 'would-update' : 'would-create';
      }
      return exists ? 'updated' : 'created';
    };
    const objects: ObjectAction[] = [
      {
        apiVersion: 'helm.toolkit.fluxcd.io/v2',
        kind: 'HelmRelease',
        name: poolName,
        namespace,
        action: verb(Boolean(existing)),
      },
      {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        name: `${poolName}-values`,
        namespace,
        action: verb(Boolean(existing)),
      },
      {
        apiVersion: 'helm.toolkit.fluxcd.io/v2',
        kind: 'HelmRelease',
        name: `${cluster.name}-agent-platform`,
        namespace,
        action: dryRun ? 'would-update' : 'updated',
      },
      {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        name: `model-backend-${backendName}`,
        namespace: MODEL_MANAGER_NAMESPACE,
        action: verb(Boolean(cluster.backend)),
      },
    ];
    const capacityGiB = mounted?.capacityGiB ?? 100;
    const result: NodePoolWriteResult = {
      cluster: cluster.name,
      namespace,
      // The pool's name as given, as cluster-manager answers it.
      pool: name,
      mode: 'apply',
      dryRun,
      chartVersion: POOL_CHART_VERSION,
      kubernetesVersion: KUBERNETES_VERSION,
      controlPlaneVersion: KUBERNETES_VERSION,
      machineImage: `flatcar-stable-4230.2.3-kube-${KUBERNETES_VERSION}-gs`,
      objects,
      manifests: [
        {
          apiVersion: 'helm.toolkit.fluxcd.io/v2',
          kind: 'HelmRelease',
          metadata: { name: poolName, namespace },
          spec: {
            chart: {
              spec: { chart: 'gpu-node-pool', version: POOL_CHART_VERSION },
            },
            values: { accelerator, sizes, zones, maxGPUs: args.maxGpus ?? 4 },
          },
        },
      ],
      gpuOperator: { status: 'present', provider: 'cluster-manager' },
      backend: {
        kind: 'kserve',
        namespace: MODEL_MANAGER_NAMESPACE,
        name: `model-backend-${backendName}`,
        target: cluster.name,
      },
      sizes: shapes,
      presetFit: {
        origin: 'published',
        source: `${FIXTURE_SERVING_PRESETS.length} preset ConfigMap(s) in ${SERVING_NAMESPACE} on ${cluster.name}`,
        presets,
      },
      warnings: presets
        .filter(p => !p.size)
        .map(
          p =>
            `${p.preset} (${p.displayName}) is hosted by no size of the pool: ${p.reason}`,
        ),
      zones,
      zonesNote,
      cache: cacheOn
        ? {
            enabled: true,
            claim: `${SERVING_NAMESPACE}/${mounted?.name ?? 'hf-cache'}`,
            exists: Boolean(mounted),
            ...(mounted && { since: mounted.createdAt }),
            capacity: `${capacityGiB}Gi`,
            tier: 'gp3',
            monthlyPriceUSD:
              Math.round(capacityGiB * GP3_USD_PER_GIB_MONTH * 100) / 100,
            priceSource: `AWS EBS gp3 list price, ${PRICE_SOURCE}`,
            priceAsOf: PRICE_AS_OF,
            note: mounted
              ? 'Every pool of the cluster serves from this claim; it is billed every month until remove_model_cache.'
              : 'The connectivity chart creates the claim with the slice; it is billed every month until remove_model_cache.',
          }
        : {
            enabled: false,
            note: 'The predictors download the weights on every start: no claim is billed.',
          },
    };
    if (dryRun) {
      return result;
    }
    if (existing) {
      // Written again before its removal settled: the pool stays.
      existing.removingSince = undefined;
      existing.accelerator = accelerator;
      existing.instanceTypes = [
        `${ACCELERATORS[accelerator].family}.${sizes[0]}`,
      ];
    } else {
      state.pools.push({
        installation,
        cluster: cluster.name,
        name: poolName,
        state: 'creating',
        accelerator,
        instanceTypes: [`${ACCELERATORS[accelerator].family}.${sizes[0]}`],
        replicas: 0,
        readyReplicas: 0,
        createdAt: this.now(),
        nodes: [],
        launched: true,
      });
    }
    if (cacheOn && !cluster.cache) {
      cluster.cache = true;
      if (!mounted) {
        state.claims.push({
          installation,
          cluster: cluster.name,
          name: 'hf-cache',
          state: 'pending',
          zone: zones[0],
          capacityGiB,
          createdAt: new Date(this.now()).toISOString(),
        });
      }
    }
    if (!cluster.backend) {
      cluster.backend = backendName;
      state.backends.push({
        installation,
        name: backendName,
        kind: 'kserve',
        state: 'kserve',
        healthy: true,
        source: 'cluster-manager',
        version: 'v0.15.2',
        cluster: cluster.name,
      });
    }
    return result;
  }

  /**
   * `delete_node_pool`: refused while a model is served on the pool's nodes,
   * unless forced, naming them; otherwise the pool goes (after a while), and
   * with the cluster's last pool its backend registration.
   */
  deleteNodePool(
    installation: string,
    args: Record<string, unknown>,
  ): NodePoolWriteResult {
    const state = this.of(installation);
    const cluster = this.cluster(
      state,
      String(args.cluster ?? ''),
      args.namespace as string | undefined,
    );
    const namespace = namespaceOf(cluster);
    const poolName = `${cluster.name}-${String(args.name ?? '')}`;
    const pool = state.pools.find(p => p.name === poolName);
    if (!pool) {
      throw clusterRefusal(
        `HelmRelease ${namespace}/${poolName} not found: list_clusters names the clusters you may see`,
      );
    }
    const served = state.models.filter(
      m =>
        m.state !== 'downloaded' &&
        (pool.nodes.includes(m.node ?? '') ||
          m.nodes?.some(n => pool.nodes.includes(n))),
    );
    const busy = pool.nodes.filter(node =>
      served.some(m => m.node === node || m.nodes?.includes(node)),
    );
    const idle = pool.nodes.filter(node => !busy.includes(node));
    if (busy.length > 0 && args.force !== true) {
      const models = served.map(m => `${SERVING_NAMESPACE}/${m.name}`);
      let text = `node pool ${poolName} still runs ${busy.length} busy node(s) on ${cluster.name}: ${busy
        .map(node => {
          const on = served.filter(
            m => m.node === node || m.nodes?.includes(node),
          );
          return `node ${node} runs ${on.map(m => `${SERVING_NAMESPACE}/${m.name}-kserve`).join(', ')}`;
        })
        .join(
          '; ',
        )}, serving ${models.length} model(s) on ${cluster.name}: ${models.join(', ')} — unload them first (model-manager's unload_model, or the cluster's Serving group) and re-run`;
      if (idle.length > 0) {
        text += `; ${idle.length} idle node(s) (${idle.join(', ')}) go with the pool once the busy ones are free`;
      }
      throw clusterRefusal(text, {
        refused: {
          nodes: busy,
          idle,
          models,
          hint: "Unload the served model(s) and re-run: delete_node_pool removes the pool's idle nodes itself and completes the teardown in one call.",
          readFrom: 'cluster',
        },
      });
    }
    const dryRun = args.dryRun === true;
    const lastPool =
      state.pools.filter(
        p => p.cluster === cluster.name && p.removingSince === undefined,
      ).length === 1;
    const verb = dryRun ? 'would-delete' : 'deleted';
    const result: NodePoolWriteResult = {
      cluster: cluster.name,
      namespace,
      pool: String(args.name),
      mode: 'apply',
      dryRun,
      objects: [
        {
          apiVersion: 'helm.toolkit.fluxcd.io/v2',
          kind: 'HelmRelease',
          name: poolName,
          namespace,
          action: verb,
        },
        {
          apiVersion: 'v1',
          kind: 'ConfigMap',
          name: `${poolName}-values`,
          namespace,
          action: verb,
        },
        ...idle.map(node => ({
          apiVersion: 'karpenter.sh/v1',
          kind: 'NodeClaim',
          name: node,
          namespace: '',
          action: verb,
        })),
        ...(lastPool && cluster.backend
          ? [
              {
                apiVersion: 'v1',
                kind: 'ConfigMap',
                name: `model-backend-${cluster.backend}`,
                namespace: MODEL_MANAGER_NAMESPACE,
                action: verb,
              },
            ]
          : []),
      ],
      lastPool,
    };
    if (!dryRun) {
      if (args.force === true) {
        for (const model of served) {
          state.models.splice(state.models.indexOf(model), 1);
        }
      }
      pool.removingSince ??= this.now();
    }
    return result;
  }

  /**
   * `remove_model_cache`: the cluster's claims (or the one named) deleted,
   * the slice switched to serve without them; refused while a served model
   * reads its weights from them.
   */
  removeModelCache(
    installation: string,
    args: Record<string, unknown>,
  ): NodePoolWriteResult {
    const state = this.of(installation);
    const cluster = this.cluster(
      state,
      String(args.cluster ?? ''),
      args.namespace as string | undefined,
    );
    const namespace = namespaceOf(cluster);
    const claims = state.claims.filter(
      c => c.cluster === cluster.name && (!args.claim || c.name === args.claim),
    );
    if (args.claim && claims.length === 0) {
      throw clusterRefusal(
        `PersistentVolumeClaim ${SERVING_NAMESPACE}/${String(args.claim)} not found: list_clusters names the clusters you may see`,
      );
    }
    const mounted = claims.some(c => c.state === 'mounted');
    const served = mounted
      ? state.models.filter(
          m => m.backend === cluster.backend && m.state !== 'downloaded',
        )
      : [];
    if (served.length > 0) {
      const models = served.map(m => `${SERVING_NAMESPACE}/${m.name}`);
      const hint =
        'Unload the models that read from the cache and re-run: the claims go once no pod mounts them.';
      throw clusterRefusal(
        `the model cache of ${cluster.name} is in use — ${served
          .map(m => `${SERVING_NAMESPACE}/${m.name}-kserve mounts hf-cache`)
          .join(
            '; ',
          )}: a claim a pod mounts is not deleted until the pod is gone (its protection finalizer holds it), and a predictor's weights are read from it; ${hint.charAt(0).toLowerCase()}${hint.slice(1)}`,
        { refused: { nodes: [], models, hint, readFrom: 'cluster' } },
      );
    }
    const dryRun = args.dryRun === true;
    const removed = claims.map(c => this.claimAnswer(cluster, c));
    if (!dryRun) {
      state.claims = state.claims.filter(c => !claims.includes(c));
      if (!state.claims.some(c => c.cluster === cluster.name)) {
        cluster.cache = false;
        for (const model of state.models.filter(
          m => m.backend === cluster.backend,
        )) {
          model.cached = false;
        }
        state.models = state.models.filter(
          m => m.backend !== cluster.backend || m.state !== 'downloaded',
        );
      }
    }
    return {
      cluster: cluster.name,
      namespace,
      pool: '',
      mode: 'apply',
      dryRun,
      objects: [
        ...(mounted
          ? [
              {
                apiVersion: 'helm.toolkit.fluxcd.io/v2',
                kind: 'HelmRelease',
                name: `${cluster.name}-agent-platform`,
                namespace,
                action: dryRun ? 'would-update' : 'updated',
                changes: ['modelCache.enabled: true → false'],
              },
            ]
          : []),
        ...claims.map(c => ({
          apiVersion: 'v1',
          kind: 'PersistentVolumeClaim',
          name: c.name,
          namespace: SERVING_NAMESPACE,
          action: dryRun ? 'would-delete' : 'deleted',
        })),
      ],
      removedClaims: removed,
    };
  }
}

function servedStatus(state: ServedState): string {
  if (state === 'serving') {
    return 'Ready';
  }
  return state === 'failed' ? 'NotReady' : 'Pending';
}

function jobStatus(
  phase: ModelManagerJob['phase'],
  percent: number,
): string | undefined {
  if (phase === 'running') {
    return percent < 5 ? 'pulling manifest' : 'downloading';
  }
  return phase === 'succeeded' ? 'success' : undefined;
}

/** A pool release's Ready condition: false failed, unknown while it installs. */
function releaseReady(state: FixtureGpuPool['state']): boolean | null {
  if (state === 'failed') {
    return false;
  }
  return state === 'creating' ? null : true;
}

function namespaceOf(cluster: FixtureGpuCluster): string {
  return `org-${cluster.organization}`;
}

function presetOf(name: string | undefined): FixtureServingPreset | undefined {
  return FIXTURE_SERVING_PRESETS.find(p => p.name === name);
}

function hostOf(backend: FixtureModelBackend): string {
  return backend.endpoint
    ? new URL(backend.endpoint).hostname
    : `${backend.name}.${backend.installation}.example.com`;
}

function downMessage(backend: FixtureModelBackend): string {
  return `Get "${backend.endpoint ?? `http://${hostOf(backend)}:11434`}/api/version": dial tcp 10.0.12.7:11434: connect: connection refused`;
}

function endpointOf(model: Model): string {
  return `http://${model.name}.${SERVING_NAMESPACE}.svc.cluster.local/v1`;
}

/** A stable digest-shaped hex string of a name, from gs-common's hash. */
function digestOf(name: string): string {
  let out = '';
  for (let round = 0; out.length < 64; round++) {
    out += hashOf(`${round}:${name}`).toString(16).padStart(8, '0');
  }
  return out.slice(0, 64);
}

let shared: ModelHostingFixtureState | undefined;

/** The state every fixture handler of model hosting shares, from the base data set. */
export function modelHostingFixtureState(): ModelHostingFixtureState {
  shared ??= new ModelHostingFixtureState(baseDataSet());
  return shared;
}
