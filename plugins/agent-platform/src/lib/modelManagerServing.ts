// The model-manager serving source's pure half: turning the documents of the
// model-manager REST API (`lib/modelManager.ts`) into the backend-agnostic
// shapes in `serving.ts`, plus the formatting the Serving view needs for
// them. The hook that fetches them is
// `components/ServingProvider/useModelManagerServingSource.ts`.

import { urlHostname } from '@giantswarm/backstage-plugin-kubernetes-react';
import type {
  ModelManagerBackend,
  ModelManagerCapabilities,
  ModelManagerLoading,
  ModelManagerModel,
  ModelManagerNode,
} from './modelManager';
import {
  endpointAuthority,
  notLoadedReadiness,
  type GpuNode,
  type ServedModel,
  type ServingBackend,
  type ServingCapabilities,
  type ServingLoading,
} from './serving';

/** `app.kubernetes.io/managed-by` the portal's own writes carry (`BACKSTAGE_FIELD_MANAGER`). */
const PORTAL_MANAGED_BY = 'giantswarm-backstage';

const MIB = 2 ** 20;

/** The model feature agents need: tool calling. */
export const TOOLS_CAPABILITY = 'tools';

/**
 * Model features not worth a chip: every model completes text, so saying so
 * is noise next to the ones that distinguish it (tools, vision, thinking).
 */
const IMPLIED_MODEL_CAPABILITIES = new Set(['completion']);

/**
 * The backends the seam knows. model-manager may grow others; an installation
 * reporting one the portal has no vocabulary for is skipped (with a console
 * warning) rather than mislabelled.
 */
export function toServingBackend(name: string): ServingBackend | undefined {
  return name === 'kserve' || name === 'ollama' ? name : undefined;
}

/** model-manager's flags are already the seam's vocabulary. */
export function toServingCapabilities(
  capabilities: ModelManagerCapabilities,
): ServingCapabilities {
  return {
    pull: capabilities.pull,
    pullProgress: capabilities.pullProgress,
    delete: capabilities.delete,
    load: capabilities.load,
    unload: capabilities.unload,
    loadedModels: capabilities.loadedModels,
    wire: capabilities.wire,
    presets: capabilities.presets,
    fitCheck: capabilities.fitCheck,
    nodeInventory: capabilities.nodeInventory,
    search: capabilities.search,
  };
}

/**
 * model-manager's loading block is already the seam's vocabulary; absent
 * stays absent (nothing is assumed about an older model-manager).
 */
export function toServingLoading(
  loading: ModelManagerLoading | undefined,
): ServingLoading | undefined {
  if (!loading) {
    return undefined;
  }
  return {
    onDemand: loading.onDemand,
    idleEviction: loading.idleEviction,
    keepAliveDefault: loading.keepAliveDefault,
    keepAliveScope: loading.keepAliveScope,
  };
}

/**
 * The `hostname:port` authorities on which the backend answers for every model
 * it has, for `ServingSourceSnapshot.sharedHosts`: Ollama's own endpoint.
 * KServe's `endpoint` is the InferenceService API, not somewhere a model
 * answers, and each predictor has a host of its own — none. The same rule
 * `endpointHosts` in {@link toServedModelFromManager} follows, with the port
 * kept: a host that also runs another OpenAI-compatible server on another
 * port must not have that server's clients read as Ollama's.
 */
export function sharedHostsOf(
  backend: ModelManagerBackend & { backend: ServingBackend },
): string[] {
  if (backend.backend === 'kserve') {
    return [];
  }
  const authority = endpointAuthority(backend.endpoint);
  return authority ? [authority] : [];
}

/**
 * The namespace of a predictor's in-cluster URL
 * (`http://<name>-predictor.<namespace>.svc.cluster.local`), else `undefined`.
 */
export function namespaceOfPredictorUrl(
  url: string | undefined,
): string | undefined {
  const host = urlHostname(url);
  const parts = host?.split('.') ?? [];
  return parts.length >= 3 && parts[2] === 'svc' ? parts[1] : undefined;
}

/**
 * One model of a model-manager inventory as a served model.
 *
 * Readiness follows what the backend says about memory and about how it
 * loads: loaded → `ready`; downloaded but not loaded → what
 * `notLoadedReadiness` makes of the backend's `loading` block — `idle` on a
 * backend that loads on demand (Ollama), `notServing` on one that does not
 * when a ModelConfig points at the model, `available` otherwise or when the
 * block is absent. On KServe the inventory is the per-node download cache plus
 * the InferenceServices: a served model (`running`) takes the
 * InferenceService's own readiness as model-manager reads it from the CR and
 * is named after the InferenceService — the name agents address it by and the
 * ModelConfig's `spec.model` — so that `findServedModel` and the CR source
 * agree on it; a cached model nobody serves sits on its node ("downloaded on
 * …") and is named after its repository. Every model is `notReady` while the
 * backend reports itself unhealthy (its inventory may then be stale).
 *
 * The endpoint every model answers on is the backend's own — on a multi-model
 * host that is one hostname for every model, which is why `findServedModel`
 * disambiguates by name. On KServe only a served model has an endpoint (the
 * predictor's), which is also what folds it onto the same InferenceService
 * read as a CR (`mergeServingSnapshots`).
 */
export function toServedModelFromManager(
  installation: string,
  backend: ModelManagerBackend & { backend: ServingBackend },
  model: ModelManagerModel,
): ServedModel {
  const running = model.running;
  const kserve = backend.backend === 'kserve';
  const resource = kserve ? (running?.resource ?? model.path) : undefined;
  const namespace = kserve
    ? namespaceOfPredictorUrl(running?.endpoint)
    : undefined;

  let readiness: ServedModel['readiness'];
  let readinessMessage: string | undefined;
  if (!backend.healthy) {
    readiness = 'notReady';
    readinessMessage =
      backend.message ??
      `The ${backend.backend} backend is not healthy; its inventory may be stale.`;
  } else if (kserve && running) {
    // The InferenceService's readiness, as model-manager reads the CR.
    const status = running.status ?? 'Pending';
    const what = `InferenceService ${resource ?? model.name}`;
    if (status === 'Ready') {
      readiness = 'ready';
      readinessMessage = `${what} is ready.`;
    } else if (status === 'Pending') {
      readiness = 'pending';
      readinessMessage = running.message ?? `${what} has not reported yet.`;
    } else {
      readiness = 'notReady';
      readinessMessage =
        running.message ??
        (status === 'Terminating'
          ? `${what} is being deleted.`
          : `${what} is not ready.`);
    }
  } else if (model.loaded) {
    readiness = 'ready';
    readinessMessage = running?.expiresAt
      ? `Loaded in memory until ${formatTime(running.expiresAt)}.`
      : 'Loaded in memory.';
  } else if (kserve && model.downloaded === false) {
    readiness = 'pending';
    readinessMessage = 'Known from a preset; not downloaded and not serving.';
  } else {
    const loading = toServingLoading(backend.loading);
    readiness = notLoadedReadiness(loading, {
      hasClient: model.modelConfig !== undefined,
    });
    const where = model.node ? `Downloaded on ${model.node}` : 'Downloaded';
    if (readiness === 'idle') {
      readinessMessage = `${where}; not loaded. ${
        backend.backend === 'ollama' ? 'Ollama' : 'The backend'
      } loads it on the first request, so an agent's first turn pays the cold start${
        loading?.idleEviction ? ', and it is evicted again after idling' : ''
      }.`;
    } else if (readiness === 'notServing') {
      readinessMessage = `${where}; not serving, and model config ${
        model.modelConfig?.namespace ?? ''
      }/${model.modelConfig?.name ?? ''} points at it — agents on it fail until it is served.`;
    } else {
      readinessMessage = kserve
        ? `${where}; not serving.`
        : 'Downloaded; not loaded in memory.';
    }
  }

  // Ollama: every model answers on the backend's own host. KServe: only a
  // served model has an endpoint, its predictor's (the backend "endpoint" is
  // the InferenceService API, not somewhere a model answers).
  const endpointHosts = Array.from(
    new Set(
      [
        kserve ? undefined : urlHostname(backend.endpoint),
        urlHostname(running?.endpoint),
      ].filter((host): host is string => Boolean(host)),
    ),
  );

  // Ollama says which server it is; on KServe the runtime is the
  // InferenceService's, which the CR read reports.
  let runtime: string | undefined = backend.backend;
  if (kserve) {
    runtime = undefined;
  } else if (backend.version) {
    runtime = `${backend.backend} ${backend.version}`;
  }

  // KServe: a served model is identified like the CR source identifies its
  // InferenceService (same id, same name), a cached one by where it sits.
  let id = `${installation}/${backend.backend}//${model.name}`;
  let name = model.name;
  if (kserve) {
    if (running && resource) {
      id = `${installation}/kserve/${namespace ?? ''}/${resource}`;
      name = resource;
    } else {
      id = `${installation}/kserve/cache/${model.node ?? ''}/${model.path ?? model.name}`;
    }
  }

  return {
    id,
    installation,
    backend: backend.backend,
    name,
    namespace,
    modelSource: model.name,
    runtime,
    readiness,
    readinessMessage,
    node: running?.node ?? model.node,
    nodeSource: kserve && running?.node ? 'pod' : undefined,
    gpuCount: running?.gpus,
    internalUrl: running?.endpoint ?? (kserve ? undefined : backend.endpoint),
    endpointHosts,
    preset: model.preset ?? running?.preset,
    managedByPortal: running?.managedBy
      ? running.managedBy === PORTAL_MANAGED_BY
      : undefined,
    sizeBytes: model.sizeBytes,
    loaded: model.loaded,
    memoryBytes: running?.sizeBytes,
    loadedUntil: running?.expiresAt,
    capabilities: model.capabilities,
    details: {
      family: model.family,
      parameterSize: model.parameterSize,
      quantization: model.quantization,
      contextLength: model.contextLength,
      format: model.format,
    },
    modelConfig: model.modelConfig
      ? {
          name: model.modelConfig.name,
          namespace: model.modelConfig.namespace,
          managed: model.modelConfig.managed,
          ready: model.modelConfig.ready,
          message: model.modelConfig.message,
        }
      : undefined,
    managerRef: model.name,
    downloaded: model.downloaded,
    cachePath: model.path,
    // model-manager is the one source that acts on what it lists.
    operable: true,
  };
}

/**
 * One node of model-manager's `GET /api/v1/nodes` as a capacity row: the GPU
 * labels it read, the memory budget it fit-checks against (what the models
 * already served there reserve of it, what is free) and the download cache
 * it keeps on the node. Device-plugin capacity and pod requests are the CR
 * source's contribution; on an installation with both, `mergeServingSnapshots`
 * lays this over that.
 */
export function toGpuNodeFromManager(
  installation: string,
  node: ModelManagerNode,
): GpuNode {
  return {
    id: `${installation}/${node.name}`,
    installation,
    name: node.name,
    ready: node.ready,
    product: node.gpuProduct,
    memoryMiB:
      node.gpuMemoryBytes !== undefined
        ? Math.round(node.gpuMemoryBytes / MIB)
        : undefined,
    labeledCount: node.gpuCount,
    memoryAllocatableBytes: node.allocatableMemoryBytes,
    memoryBudgetBytes: node.budgetBytes,
    memoryBudgetSource: node.budgetSource,
    memoryReservedBytes: node.reservedBytes,
    memoryFreeBytes: node.freeBytes,
    cache: node.cache
      ? {
          claim: node.cache.claim,
          mountPath: node.cache.mountPath,
          models: node.cache.models,
          bytesUsed: node.cache.bytesUsed,
          scannedAt: node.cache.scannedAt,
          shared: node.cache.shared,
          error: node.cache.error,
        }
      : undefined,
  };
}

/**
 * Whether a KServe row is a served model — an InferenceService, whichever
 * source listed it — as opposed to a cached download or a preset nobody
 * serves: a CR read always has a namespace; model-manager's inventory marks a
 * served model `loaded` and names its predictor.
 */
export function isServedInferenceService(model: ServedModel): boolean {
  return (
    model.backend === 'kserve' &&
    (model.namespace !== undefined || model.loaded === true)
  );
}

/**
 * The reference to hand model-manager for a row. A served KServe model goes by
 * its InferenceService name: model-manager resolves that for every operation
 * (unload, wire, unwire, delete) and it is unambiguous even when the
 * InferenceService was composed from another model's preset — the repository
 * of the cached weights then names nothing model-manager serves. Anything else
 * goes by what model-manager listed it as (`managerRef`: an Ollama tag, the
 * repository of a cached download), else the row's name.
 */
export function managerRefOf(model: ServedModel): string {
  if (isServedInferenceService(model)) {
    return model.name;
  }
  return model.managerRef ?? model.name;
}

/**
 * Whether agents cannot use this model: the backend lists its features and
 * tool calling is not among them. `false` when features are unknown — no
 * warning on a guess.
 */
export function lacksToolCalling(
  model: Pick<ServedModel, 'capabilities'>,
): boolean {
  return (
    model.capabilities !== undefined &&
    !model.capabilities.includes(TOOLS_CAPABILITY)
  );
}

/** The features worth showing, in the backend's order. */
export function notableCapabilities(capabilities: string[]): string[] {
  return capabilities.filter(
    capability => !IMPLIED_MODEL_CAPABILITIES.has(capability),
  );
}

const BYTE_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];

/** Bytes → a short binary-prefixed figure: 6594474711 → "6.1 GiB". */
export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) {
    return '—';
  }
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  // Whole bytes are exact; above that one decimal until the figure has three
  // digits, where a decimal is noise ("498 MiB", "6.1 GiB").
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${value.toFixed(digits)} ${BYTE_UNITS[unit]}`;
}

/** A context window: 262144 → "256k", 40960 → "40k", 4096 → "4k". */
export function formatContextLength(length: number | undefined): string {
  if (length === undefined || !Number.isFinite(length) || length <= 0) {
    return '—';
  }
  if (length < 1024) {
    return String(length);
  }
  const k = length / 1024;
  return `${Number.isInteger(k) ? k : Math.round(k)}k`;
}

/**
 * The row description under a served model's name: what kind of model it is,
 * from the details the backend reports. Empty when it reports none.
 */
export function describeServedModel(
  details: ServedModel['details'] | undefined,
): string {
  if (!details) {
    return '';
  }
  return [
    details.parameterSize,
    details.quantization,
    details.contextLength !== undefined
      ? `${formatContextLength(details.contextLength)} ctx`
      : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** ISO time → a short local clock time, else the input as-is. */
export function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      });
}

/**
 * The shape of a model reference the pull form accepts — the same rule the
 * backend proxy enforces (`MODEL_REF_PATTERN` there), so a reference the form
 * lets through is never refused a step later with a less helpful message.
 */
export const MODEL_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._\-:/]*$/;
export const MODEL_REF_MAX_LENGTH = 255;

/** Why a model reference cannot be pulled, or `undefined` when it can. */
export function validateModelRef(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return 'Enter a model reference, e.g. qwen2.5:0.5b or hf.co/org/repo:Q4_K_M.';
  }
  if (trimmed.length > MODEL_REF_MAX_LENGTH) {
    return `A model reference is at most ${MODEL_REF_MAX_LENGTH} characters.`;
  }
  if (!MODEL_REF_PATTERN.test(trimmed)) {
    return 'A model reference is letters, digits, dots, dashes, underscores, colons and slashes — no spaces.';
  }
  return undefined;
}
