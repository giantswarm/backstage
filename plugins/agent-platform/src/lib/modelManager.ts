// Wire shapes of the model-manager REST API (giantswarm/model-manager,
// `api/openapi.yaml`), as the portal reads them through the
// agent-platform-backend pass-through. Backend-agnostic by contract: the same
// documents describe an Ollama-backed lab and a KServe-backed GPU install, and
// `capabilities` says which operations the backend behind an installation
// offers — the UI renders per flag, never per backend name.
//
// Parsing is forgiving on purpose (unknown fields pass through, a missing or
// mistyped optional degrades to `undefined`) so that a field added upstream
// never blanks a row; only the identity fields are required.

import { z } from 'zod';

/** A string that is present and non-empty, else `undefined`. */
const wireString = z
  .unknown()
  .transform(value =>
    typeof value === 'string' && value !== '' ? value : undefined,
  )
  .optional();

/** A finite number, else `undefined`. */
const wireNumber = z
  .unknown()
  .transform(value =>
    typeof value === 'number' && Number.isFinite(value) ? value : undefined,
  )
  .optional();

const wireBoolean = (fallback: boolean) =>
  z
    .unknown()
    .transform(value => (typeof value === 'boolean' ? value : fallback))
    .optional()
    .transform(value => value ?? fallback);

/**
 * A boolean that is present, else `undefined` — for flags whose absence means
 * "this backend does not say", which is not the same as false.
 */
const wireOptionalBoolean = z
  .unknown()
  .transform(value => (typeof value === 'boolean' ? value : undefined))
  .optional();

/**
 * The capability flags `GET /api/v1/backend` reports. A false flag means the
 * matching operation answers `501 unsupported` on this installation, so the
 * UI must not offer it. Absent flags read as false: a backend that does not
 * mention a capability does not have it.
 */
export const modelManagerCapabilitiesSchema = z.looseObject({
  /** Import a model by reference. */
  pull: wireBoolean(false),
  /** Pull jobs report bytes completed/total. */
  pullProgress: wireBoolean(false),
  delete: wireBoolean(false),
  /** Load into memory / start serving. */
  load: wireBoolean(false),
  /** Evict from memory / stop serving. */
  unload: wireBoolean(false),
  /** Loaded models are listed with their memory use. */
  loadedModels: wireBoolean(false),
  /** Creates kagent ModelConfigs (needs Kubernetes access). */
  wire: wireBoolean(false),
  /** Curated serving presets (KServe). */
  presets: wireBoolean(false),
  /** Node-memory fit check (KServe). */
  fitCheck: wireBoolean(false),
  /** Per-node inventory (KServe). */
  nodeInventory: wireBoolean(false),
  /** Model hub search (KServe). */
  search: wireBoolean(false),
});

export type ModelManagerCapabilities = z.infer<
  typeof modelManagerCapabilitiesSchema
>;

/**
 * How the backend brings a model into memory (`GET /api/v1/backend`
 * `loading`). What the portal's wording for a not-loaded model keys off:
 * `onDemand` makes it "Idle — loads on first request" instead of a fault. A
 * model-manager predating the block reports none, and the portal then assumes
 * nothing.
 */
export const modelManagerLoadingSchema = z.looseObject({
  /** The backend loads a model on the first inference request naming it. */
  onDemand: wireBoolean(false),
  /** The backend evicts idle models on its own. */
  idleEviction: wireBoolean(false),
  /**
   * model-manager's default keep-alive for its own load requests (Ollama).
   * Not the host's `OLLAMA_KEEP_ALIVE`, which is unobservable.
   */
  keepAliveDefault: wireString,
  /** `request` — every request re-arms the timer; `server` — fixed. */
  keepAliveScope: z
    .unknown()
    .transform(value =>
      value === 'request' || value === 'server' ? value : undefined,
    )
    .optional(),
});

export type ModelManagerLoading = z.infer<typeof modelManagerLoadingSchema>;

/** `GET /api/v1/backend`. */
export const modelManagerBackendSchema = z.looseObject({
  /** `ollama` or `kserve` today; kept open for what comes next. */
  backend: z.string(),
  /** Backend server version, when known. */
  version: wireString,
  /** The backend endpoint as model-manager reaches it. */
  endpoint: wireString,
  healthy: wireBoolean(false),
  message: wireString,
  capabilities: modelManagerCapabilitiesSchema
    .optional()
    .transform(value => value ?? modelManagerCapabilitiesSchema.parse({})),
  wiring: z
    .looseObject({
      namespace: wireString,
      apiVersion: wireString,
      autoWire: wireBoolean(false),
    })
    .optional(),
  /** Absent on a model-manager that does not report loading semantics. */
  loading: z
    .unknown()
    .transform(value => {
      if (value === null || typeof value !== 'object') {
        return undefined;
      }
      const parsed = modelManagerLoadingSchema.safeParse(value);
      return parsed.success ? parsed.data : undefined;
    })
    .optional(),
});

export type ModelManagerBackend = z.infer<typeof modelManagerBackendSchema>;

/**
 * The kagent ModelConfig of a model as model-manager reports it: the one it
 * created, or — on kserve — one somebody else created for the same predictor
 * (the portal's serve flow), which it recognises but never touches.
 */
export const modelConfigRefSchema = z.looseObject({
  name: z.string(),
  namespace: z.string(),
  apiVersion: wireString,
  provider: wireString,
  model: wireString,
  /** `spec.model` — the name the provider serves the model under (kserve: the InferenceService name). */
  providerModel: wireString,
  /** `openAI.baseUrl` or `ollama.host`. */
  endpoint: wireString,
  /**
   * Whether model-manager created it (only those are updated or deleted by
   * it). Absent on a model-manager that predates the field, which only ever
   * reported its own — hence true.
   */
  managed: wireBoolean(true),
  /** Mirrors the kagent `Accepted` condition. */
  ready: wireBoolean(false),
  message: wireString,
});

export type ModelConfigRef = z.infer<typeof modelConfigRefSchema>;

/** One entry of `GET /api/v1/loaded`, and `Model.running`. */
export const modelManagerLoadedModelSchema = z.looseObject({
  name: z.string(),
  digest: wireString,
  /** Memory footprint. */
  sizeBytes: wireNumber,
  vramBytes: wireNumber,
  contextLength: wireNumber,
  /** When the backend will evict the model; absent = forever / unknown. */
  expiresAt: wireString,
  /** Inference URL (KServe). */
  endpoint: wireString,
  node: wireString,
  /** Ollama `loaded`; KServe InferenceService readiness `Ready`, `NotReady`, `Pending` or `Terminating`. */
  status: wireString,
  /** KServe — why the model is not ready. */
  message: wireString,
  /** KServe — the InferenceService name (also the served model name). */
  resource: wireString,
  /** KServe — the preset the InferenceService was created from. */
  preset: wireString,
  /** KServe — accelerators the predictor requests. */
  gpus: wireNumber,
  /** KServe — `app.kubernetes.io/managed-by` of the InferenceService (model-manager, backstage, …). */
  managedBy: wireString,
});

export type ModelManagerLoadedModel = z.infer<
  typeof modelManagerLoadedModelSchema
>;

/** One entry of `GET /api/v1/models`: a downloaded model, enriched. */
export const modelManagerModelSchema = z.looseObject({
  name: z.string(),
  digest: wireString,
  /** On-disk size. */
  sizeBytes: wireNumber,
  modifiedAt: wireString,
  format: wireString,
  family: wireString,
  parameterSize: wireString,
  quantization: wireString,
  contextLength: wireNumber,
  /** Model features: completion, tools, vision, embedding, thinking, … */
  capabilities: z
    .unknown()
    .transform(value =>
      Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : undefined,
    )
    .optional(),
  /** Node holding the cache entry (KServe). */
  node: wireString,
  /**
   * KServe — whether the weights are in the node's cache: false for a model
   * known only from a preset or a running InferenceService whose weights are
   * not cached yet. Absent (undefined) means the backend lists downloads only.
   */
  downloaded: z
    .unknown()
    .transform(value => (typeof value === 'boolean' ? value : undefined))
    .optional(),
  /** KServe — the cache directory, which is the InferenceService name the storage-initializer uses. */
  path: wireString,
  /** KServe — the serving preset whose model this is. */
  preset: wireString,
  loaded: wireBoolean(false),
  running: z
    .unknown()
    .transform(value => {
      const parsed = modelManagerLoadedModelSchema.safeParse(value);
      return parsed.success ? parsed.data : undefined;
    })
    .optional(),
  modelConfig: z
    .unknown()
    .transform(value => {
      const parsed = modelConfigRefSchema.safeParse(value);
      return parsed.success ? parsed.data : undefined;
    })
    .optional(),
});

export type ModelManagerModel = z.infer<typeof modelManagerModelSchema>;

export const MODEL_MANAGER_JOB_PHASES = [
  'pending',
  'running',
  'succeeded',
  'failed',
  'cancelled',
] as const;

export type ModelManagerJobPhase = (typeof MODEL_MANAGER_JOB_PHASES)[number];

/** A background operation (`type: pull`), polled through `GET /api/v1/jobs/{id}`. */
export const modelManagerJobSchema = z.looseObject({
  id: z.string(),
  type: wireString,
  model: z.string(),
  phase: z.unknown().transform((value): ModelManagerJobPhase =>
    MODEL_MANAGER_JOB_PHASES.includes(value as ModelManagerJobPhase)
      ? (value as ModelManagerJobPhase)
      : // An unknown phase is treated as still in flight: the poll keeps
        // going and a later, known phase settles it.
        'running',
  ),
  /** Backend progress message, e.g. "pulling manifest". */
  status: wireString,
  bytesCompleted: wireNumber,
  bytesTotal: wireNumber,
  percent: wireNumber,
  error: wireString,
  createdAt: wireString,
  startedAt: wireString,
  finishedAt: wireString,
  /** Whether the job wires the model into kagent on success. */
  wire: wireBoolean(false),
  /**
   * KServe: the node whose cache receives the download, when the backend
   * reports it (model-manager does not yet — the request names the node, the
   * job does not echo it back).
   */
  node: wireString,
  /** For a pull with wire: the ModelConfig created. */
  result: z
    .unknown()
    .transform(value => {
      const parsed = modelConfigRefSchema.safeParse(value);
      return parsed.success ? parsed.data : undefined;
    })
    .optional(),
});

export type ModelManagerJob = z.infer<typeof modelManagerJobSchema>;

/** Whether a job is still doing something (worth polling for). */
export function isJobActive(job: Pick<ModelManagerJob, 'phase'>): boolean {
  return job.phase === 'pending' || job.phase === 'running';
}

/** One entry of `GET /api/v1/presets` (kserve): a published ServingPreset, resolved for clients. */
export const modelManagerPresetSchema = z.looseObject({
  /** Also the InferenceService name a load creates. */
  name: z.string(),
  displayName: wireString,
  description: wireString,
  /** `shipped` or `values`. */
  source: wireString,
  /** Hugging Face repository (`owner/name`). */
  model: wireString,
  storageUri: wireString,
  format: wireString,
  runtime: wireString,
  contextLength: wireNumber,
  capabilities: z
    .unknown()
    .transform(value =>
      Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : undefined,
    )
    .optional(),
  gpus: wireNumber,
  weightsBytes: wireNumber,
  overheadBytes: wireNumber,
  requiredBytes: wireNumber,
});

export type ModelManagerPreset = z.infer<typeof modelManagerPresetSchema>;

/** One hit of `GET /api/v1/search` (kserve — the Hugging Face Hub). */
export const modelManagerSearchResultSchema = z.looseObject({
  /** Repository id, `owner/name`. */
  id: z.string(),
  author: wireString,
  downloads: wireNumber,
  likes: wireNumber,
  /** Needs a hub token with access to download. */
  gated: wireBoolean(false),
  private: wireBoolean(false),
  pipelineTag: wireString,
  library: wireString,
  tags: z
    .unknown()
    .transform(value =>
      Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : [],
    )
    .optional()
    .transform(value => value ?? []),
  lastModified: wireString,
  /** Serving presets that serve exactly this model. */
  presets: z
    .unknown()
    .transform(value =>
      Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : [],
    )
    .optional()
    .transform(value => value ?? []),
});

export type ModelManagerSearchResult = z.infer<
  typeof modelManagerSearchResultSchema
>;

/**
 * `POST /api/v1/models/fit-check` (kserve): weights resolved from the hub,
 * plus overhead, against a node's memory budget. `fits: false` arrives as a
 * 200 with `reason`; pull and load refuse such a model with 412.
 */
export const modelManagerFitResultSchema = z.looseObject({
  model: z.string(),
  fits: wireBoolean(false),
  /** Human-readable explanation of the numbers. */
  reason: wireString,
  /** Preset used for overhead (and weights when the hub could not tell). */
  preset: wireString,
  /** Every preset serving the model. */
  presets: z
    .unknown()
    .transform(value =>
      Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : [],
    )
    .optional()
    .transform(value => value ?? []),
  weightsBytes: wireNumber,
  /** `safetensors-index`, `tree` or `preset`. */
  weightsSource: wireString,
  overheadBytes: wireNumber,
  requiredBytes: wireNumber,
  /** What a pull fetches (all repository files). */
  downloadBytes: wireNumber,
  /** Node the check was made against. */
  node: wireString,
  budgetBytes: wireNumber,
  /** `gpu-labels` or `allocatable`. */
  budgetSource: wireString,
  /** Needed by the models already served on the node. */
  reservedBytes: wireNumber,
  freeBytes: wireNumber,
  gated: wireBoolean(false),
  private: wireBoolean(false),
  /** A hub token Secret is configured on the installation. */
  tokenConfigured: wireBoolean(false),
  /** The model is already in the node's cache. */
  cached: wireBoolean(false),
});

export type ModelManagerFitResult = z.infer<typeof modelManagerFitResultSchema>;

/**
 * One entry of `GET /api/v1/nodes`: a node's memory budget and download cache.
 * On kserve one per cluster node (GPU labels, device-plugin count, the cache);
 * on ollama the one host the backend proxies, whose budget is the host's
 * memory (`budgetSource: host-meminfo`), which counts no GPUs — Ollama's API
 * does not expose the accelerator — but says whether a loaded model sits on
 * one (`accelerated`).
 */
export const modelManagerNodeSchema = z.looseObject({
  name: z.string(),
  ready: wireBoolean(false),
  architecture: wireString,
  allocatableMemoryBytes: wireNumber,
  /** Accelerators on the node (kserve); `0` on ollama, which cannot count them. */
  gpuCount: wireNumber,
  /** Memory of one GPU, from the node labels. */
  gpuMemoryBytes: wireNumber,
  gpuProduct: wireString,
  /**
   * ollama only: whether any loaded model has memory on the accelerator
   * (`running.vramBytes` > 0). Absent on backends that count GPUs instead.
   */
  accelerated: wireOptionalBoolean,
  budgetBytes: wireNumber,
  /** `gpu-labels`, `allocatable` or `annotation` (kserve); `host-meminfo` or `override` (ollama). */
  budgetSource: wireString,
  /** The backend's note on the budget: an ignored annotation, or what the host figures mean. */
  message: wireString,
  reservedBytes: wireNumber,
  freeBytes: wireNumber,
  /** The download cache on this node; absent when the node holds none. */
  cache: z
    .unknown()
    .transform(value => {
      const parsed = z
        .looseObject({
          claim: wireString,
          mountPath: wireString,
          models: wireNumber,
          bytesUsed: wireNumber,
          scannedAt: wireString,
          /** Network storage visible from every node. */
          shared: wireBoolean(false),
          /** Last scan failure; contents may be stale. */
          error: wireString,
        })
        .safeParse(value);
      return parsed.success && value !== null && typeof value === 'object'
        ? parsed.data
        : undefined;
    })
    .optional(),
});

export type ModelManagerNode = z.infer<typeof modelManagerNodeSchema>;

/**
 * Parse a list envelope (`{ models: [...] }`, `{ jobs: [...] }`, …), dropping
 * rows that fail their schema rather than failing the whole list — one
 * malformed model must not blank the inventory.
 */
export function parseModelManagerList<T>(
  body: unknown,
  key: string,
  schema: z.ZodType<T>,
): T[] {
  const items = (body as Record<string, unknown> | undefined)?.[key];
  if (!Array.isArray(items)) {
    return [];
  }
  return items.flatMap(item => {
    const parsed = schema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}
