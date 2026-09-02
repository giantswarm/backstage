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
});

export type ModelManagerBackend = z.infer<typeof modelManagerBackendSchema>;

/** The kagent ModelConfig model-manager created for a model. */
export const modelConfigRefSchema = z.looseObject({
  name: z.string(),
  namespace: z.string(),
  apiVersion: wireString,
  provider: wireString,
  model: wireString,
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
  status: wireString,
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
