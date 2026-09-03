// The backend-agnostic shape of "a model being served" for the Models tab's
// Serving view, and the pure helpers over it.
//
// This is the seam between the UI and wherever the serving data comes from. A
// *serving source* (see `components/ServingProvider`) turns one backend's own
// objects into these types: today the KServe source reads InferenceService,
// Node and Pod resources with the user's RBAC (`lib/kserveServing.ts`); a
// model-manager source (Ollama or KServe behind the model-manager API, with
// capability flags) plugs in beside it without the table, panel or linking
// code changing. Keep backend specifics out of here.

import {
  urlHostname,
  type ModelConfig,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import type { StatusLabelIntent } from '@giantswarm/backstage-plugin-ui-react';

/**
 * Serving backends a source can report. `kserve` — InferenceServices read as
 * CRs; `ollama` — the model-manager's host-Ollama backend (arrives with the
 * model-manager source; listed here so the union is settled).
 */
export type ServingBackend = 'kserve' | 'ollama';

/** How each backend is named in prose ("Served by Ollama model …"). */
export const SERVING_BACKEND_LABEL: Record<ServingBackend, string> = {
  kserve: 'InferenceService',
  ollama: 'Ollama model',
};

/**
 * Readiness of a served model, backend-neutral — the one vocabulary the
 * Serving view, the Model configs view, the Agents view and the session
 * composer share. Derived from what the backend reports about the row plus
 * its loading semantics ({@link ServingLoading}), never from the backend's
 * name; labels and intents live in {@link SERVED_MODEL_READINESS}.
 *
 * - `ready` — loaded / serving; answering requests.
 * - `idle` — not loaded, on a backend that loads a model on the first
 *   request naming it (`loading.onDemand`): an agent on it works, its first
 *   turn pays the cold start. Ordinary state on Ollama, whose scheduler also
 *   evicts idle models on its own — not a fault, so not a warning.
 * - `notServing` — nothing answers for the model although a client (a kagent
 *   ModelConfig) points at it: a KServe InferenceService stopped or never
 *   created, an Ollama model deleted while its ModelConfig remains. Agents on
 *   it fail at their first turn; the fix — Load, Serve, Pull — is offered
 *   where the user is.
 * - `available` — downloaded (present on the backend) but not running, and no
 *   request would start it: a model in a KServe node cache that nothing points
 *   at, or a not-loaded model on a backend whose loading semantics are unknown
 *   (a model-manager predating the `loading` block). Inventory, not a fault;
 *   the PDR's "a download becomes Available".
 * - `downloading` — a pull in progress; the row becomes `available` or `idle`
 *   when it completes.
 * - `notReady` — exists but not serving: rolling out, failed to load, or the
 *   backend is unhealthy; `readinessMessage` says which.
 * - `pending` — no verdict yet ("not known", not "broken").
 */
export type ServedModelReadiness =
  | 'ready'
  | 'idle'
  | 'notServing'
  | 'available'
  | 'downloading'
  | 'notReady'
  | 'pending';

export type ServedModelReadinessPresentation = {
  /** The status label. */
  label: string;
  /** What the status means; picks the colour (see ui-react's `StatusLabel`). */
  intent: StatusLabelIntent;
  /** The state in a sentence: "InferenceService x is <phrase>". */
  phrase: string;
  /** What the state means, for a tooltip when the backend has no words of its own. */
  description: string;
};

/**
 * How each readiness presents, in one place so the tables agree. `notServing`
 * is the only warning: everything else is either fine, a fault the backend
 * explains (`notReady`), or simply not known yet.
 */
export const SERVED_MODEL_READINESS: Record<
  ServedModelReadiness,
  ServedModelReadinessPresentation
> = {
  ready: {
    label: 'Ready',
    intent: 'positive',
    phrase: 'ready',
    description: 'Loaded and answering requests.',
  },
  idle: {
    label: 'Idle',
    intent: 'neutral',
    phrase: 'idle — loads on first request',
    description:
      'Not loaded right now. The backend loads it on the first request naming it, so an agent on it works; its first turn pays the cold start.',
  },
  notServing: {
    label: 'Not serving',
    intent: 'warning',
    phrase: 'not serving',
    description:
      'Nothing answers for this model, so agents on it fail at their first turn until it is loaded, served or pulled again.',
  },
  available: {
    label: 'Available',
    intent: 'info',
    phrase: 'available (not loaded)',
    description: 'Downloaded but not running. Load or serve it to use it.',
  },
  downloading: {
    label: 'Downloading',
    intent: 'info',
    phrase: 'downloading',
    description: 'Being pulled onto the backend.',
  },
  notReady: {
    label: 'Not ready',
    intent: 'negative',
    phrase: 'not ready',
    description:
      'Exists but is not serving: rolling out, failed, or the backend is unhealthy.',
  },
  pending: {
    label: 'Pending',
    intent: 'neutral',
    phrase: 'pending',
    description: 'No verdict from the backend yet.',
  },
};

/**
 * Severity order for a readiness column: ascending puts the rows that need
 * attention first. Alphabetical order on the labels would be meaningless.
 */
export const SERVED_MODEL_READINESS_SEVERITY: Record<
  ServedModelReadiness,
  number
> = {
  notServing: 0,
  notReady: 1,
  pending: 2,
  downloading: 3,
  available: 4,
  idle: 5,
  ready: 6,
};

/**
 * Whether a client (an agent) pointing at a model in this state fails at its
 * first request — what the session composer warns about. `idle` is not a
 * failure (the request loads the model), nor is `available` (no claim is made
 * about what a request does when the semantics are unknown).
 */
export function isServingFailure(readiness: ServedModelReadiness): boolean {
  return readiness === 'notServing' || readiness === 'notReady';
}

/**
 * How a backend brings a model into memory, as the backend reports itself
 * (model-manager's `GET /api/v1/backend` `loading` block). Decides the word
 * for a downloaded model that is not running — see {@link notLoadedReadiness}.
 * Absent when the backend does not say (a model-manager predating the block):
 * then nothing is assumed and the wording stays at `available`.
 */
export type ServingLoading = {
  /** A request naming a not-loaded model loads it first (Ollama). */
  onDemand: boolean;
  /** The backend evicts idle models by itself. */
  idleEviction: boolean;
  /**
   * The keep-alive model-manager's own load requests carry (a duration such
   * as `5m`). Not the backend host's default — that is unobservable from
   * here, and on Ollama every request re-arms the timer with its own value,
   * so a portal Load only pre-warms.
   */
  keepAliveDefault?: string;
  /** `request` — every request re-arms the timer (Ollama); `server` — fixed. */
  keepAliveScope?: 'request' | 'server';
};

/**
 * The readiness of a model that is downloaded but not running: `idle` when
 * the backend loads on demand; otherwise `notServing` when a client points at
 * it (its requests fail) and `available` when nothing does (inventory). With
 * unknown semantics, `available` — today's wording, nothing claimed.
 */
export function notLoadedReadiness(
  loading: ServingLoading | undefined,
  options: { hasClient?: boolean } = {},
): ServedModelReadiness {
  if (loading?.onDemand) {
    return 'idle';
  }
  if (loading && options.hasClient) {
    return 'notServing';
  }
  return 'available';
}

export type ServedModel = {
  /** Stable unique key: installation + backend + namespace + name. */
  id: string;
  installation: string;
  backend: ServingBackend;
  /** Backend-native identity: the InferenceService name, an Ollama tag. */
  name: string;
  /** Namespace, for backends that have one. */
  namespace?: string;
  /** Where the weights come from: `hf://…`, `pvc://…`, an Ollama tag. */
  modelSource?: string;
  /** What serves it: a (Cluster)ServingRuntime name, `ollama`, … */
  runtime?: string;
  readiness: ServedModelReadiness;
  /** The backend's own explanation of a non-ready state, for the tooltip. */
  readinessMessage?: string;
  /** Node the workload runs on or is pinned to; `undefined` when unknown. */
  node?: string;
  /** Whether `node` is where the pod actually is, or only the declared pin. */
  nodeSource?: 'pod' | 'spec';
  /** GPUs requested. `undefined` when the backend reports none. */
  gpuCount?: number;
  /** URL in-cluster clients (a kagent ModelConfig) use. */
  internalUrl?: string;
  /** Published URL, when the backend exposes one. */
  externalUrl?: string;
  /**
   * Every hostname this model answers on, lower-cased. What a client base URL
   * is matched against to tell which served model it fronts.
   */
  endpointHosts: string[];
  /** Friendly name, when the backend records one (a preset's display name). */
  displayName?: string;
  /** The serving preset this model was served from, when the backend records it. */
  preset?: string;
  /**
   * Whether this portal created the served model. Absent means not ours (or
   * unknown) — hand-written manifests, GitOps, another tool.
   */
  managedByPortal?: boolean;
  /**
   * The client config the portal promised to create once the model answers:
   * a kagent ModelConfig, by namespace and name. Written by the serve flow,
   * completed by the auto-wiring in whichever session first sees the model
   * ready. Absent for models the portal did not serve.
   */
  autoWire?: { namespace: string; name: string };
  /** On-disk size of the weights, when the backend reports it. */
  sizeBytes?: number;
  /**
   * Whether the model is in memory / running right now. `undefined` when the
   * backend has no such notion (a bare InferenceService read as a CR).
   */
  loaded?: boolean;
  /** Memory footprint while loaded. */
  memoryBytes?: number;
  /**
   * The part of `memoryBytes` that sits on an accelerator (Ollama's
   * `size_vram`): all of it when the model runs on the GPU, `0` when it runs
   * on the CPU, in between when it is split. `undefined` when the backend
   * does not say.
   */
  memoryVramBytes?: number;
  /** When the backend will evict a loaded model (ISO time); absent = no expiry known. */
  loadedUntil?: string;
  /**
   * Model features the backend reports (`tools`, `vision`, `thinking`,
   * `embedding`, …). Agents need `tools`; a model without it cannot be used
   * by one. `undefined` when the backend does not report features at all.
   */
  capabilities?: string[];
  /** Identity details for the row's description, when the backend has them. */
  details?: {
    family?: string;
    parameterSize?: string;
    quantization?: string;
    contextLength?: number;
    format?: string;
  };
  /**
   * The kagent ModelConfig the serving backend knows for this model: the one
   * it created (model-manager's auto-wiring), or — `managed: false` — one it
   * recognises as somebody else's wiring of the same predictor (the portal's
   * serve flow), which it never updates or deletes. With the controller's
   * verdict on it. Exact — no endpoint matching involved — so it links even
   * when the user cannot list ModelConfigs. Absent when the backend knows
   * none, or does not say.
   */
  modelConfig?: {
    name: string;
    namespace: string;
    /** Created by the backend itself; `undefined` reads as yes (an older backend only ever reported its own). */
    managed?: boolean;
    ready?: boolean;
    message?: string;
  };
  /**
   * The reference the operating source (model-manager) knows this model by
   * and takes in its requests — an Ollama tag, a Hugging Face repository. Set
   * by that source only; a row merged from a CR read and a model-manager
   * inventory keeps the CR's `name` (the InferenceService) and this reference
   * side by side. Absent means no source operates on the row.
   */
  managerRef?: string;
  /**
   * KServe through model-manager: whether the weights sit in a node's
   * download cache. `false` for a model served straight from the hub (its
   * storage-initializer downloads on every start) or known only from a
   * preset; `undefined` when the backend has no such notion (Ollama lists
   * downloads only; a bare CR read knows nothing of caches).
   */
  downloaded?: boolean;
  /** KServe: the cache directory holding the weights — the InferenceService name the storage-initializer uses. */
  cachePath?: string;
  /**
   * Whether the source that lists this model can also operate on it — load,
   * unload, delete, wire — through the installation's `ServingCapabilities`.
   * The row-level half of those flags: on an installation with two sources
   * (KServe CRs read next to a model-manager), only the rows of the operating
   * source get the actions menu. A source that only reads leaves it unset.
   */
  operable?: boolean;
};

/**
 * What a serving source can *do* on an installation, beyond listing — the
 * capability flags of model-manager's `GET /api/v1/backend`, made
 * backend-agnostic. The UI renders a control when the flag is true and
 * nothing when it is false: capability skew between backends (no GPU panel
 * on Ollama, no pull on a bare KServe CR view) is ordinary state, never an
 * error. Sources that only read contribute the read-side flags they can
 * honour (`nodeInventory` for a source that lists GPU nodes) and false for
 * the rest.
 */
export type ServingCapabilities = {
  /** Import a model by reference (Ollama tag, `hf.co/...`). */
  pull: boolean;
  /** Pull jobs report bytes completed/total. */
  pullProgress: boolean;
  delete: boolean;
  /** Load into memory / start serving. */
  load: boolean;
  /** Evict from memory / stop serving. */
  unload: boolean;
  /** Loaded models are listed with their memory use. */
  loadedModels: boolean;
  /** Create / remove kagent ModelConfigs for served models. */
  wire: boolean;
  /** Curated serving presets. */
  presets: boolean;
  /** Node-memory fit check. */
  fitCheck: boolean;
  /** Per-node inventory — the GPU capacity panel. */
  nodeInventory: boolean;
  /** Model hub search. */
  search: boolean;
};

/** Every flag false: a source that can only list. */
export const NO_SERVING_CAPABILITIES: ServingCapabilities = {
  pull: false,
  pullProgress: false,
  delete: false,
  load: false,
  unload: false,
  loadedModels: false,
  wire: false,
  presets: false,
  fitCheck: false,
  nodeInventory: false,
  search: false,
};

/** Whether any per-model operation is offered — decides the actions column. */
export function hasServedModelActions(
  capabilities: ServingCapabilities | undefined,
): boolean {
  return Boolean(
    capabilities &&
    (capabilities.load ||
      capabilities.unload ||
      capabilities.delete ||
      capabilities.wire),
  );
}

/** A GPU-carrying node as the capacity panel shows it. */
export type GpuNode = {
  /** Stable unique key: installation + node name. */
  id: string;
  installation: string;
  name: string;
  ready: boolean;
  /** `nvidia.com/gpu.product` from gpu-feature-discovery. */
  product?: string;
  /** `nvidia.com/gpu.memory` (MiB per GPU) from gpu-feature-discovery. */
  memoryMiB?: number;
  /** `nvidia.com/gpu.count` from gpu-feature-discovery. */
  labeledCount?: number;
  /**
   * What the device plugin advertises. `undefined` = the node advertises no
   * `nvidia.com/gpu` at all — no device plugin, or a node whose GPUs are only
   * known from labels. A valid state, not an error.
   */
  capacity?: number;
  allocatable?: number;
  /**
   * `nvidia.com/gpu` requested by non-terminal pods bound to this node.
   * `undefined` until pods were read (or when they could not be).
   */
  requested?: number;
  /**
   * `status.allocatable.memory` in bytes — what the scheduler may hand to pods.
   * The memory budget a fit check uses on a node whose GPU shares system
   * memory (unified memory), and the fallback when no GPU memory is labelled.
   */
  memoryAllocatableBytes?: number;
  /** `false` when the node is cordoned (`spec.unschedulable`). */
  schedulable?: boolean;
  /**
   * The memory budget a serving backend fit-checks against on this node —
   * GPU memory from the labels, else allocatable memory — as model-manager
   * reports it, with what the models already served there reserve of it and
   * what is left. Absent from a source that only reads the cluster.
   */
  memoryBudgetBytes?: number;
  /**
   * Where `memoryBudgetBytes` comes from: `gpu-labels` or `allocatable` (a
   * cluster node), `annotation` (overridden on the node), `host-meminfo` —
   * the memory of the host a backend runs on, as the serving layer's pod sees
   * it — or `override`, the operator's figure for that host when the pod's
   * view is not the host's ({@link isHostMemoryNode} for both).
   */
  memoryBudgetSource?: string;
  /** The backend's own note on the budget: how it was derived, what the figures mean. */
  memoryBudgetNote?: string;
  memoryReservedBytes?: number;
  memoryFreeBytes?: number;
  /**
   * Whether any model loaded on this node has memory on an accelerator.
   * Reported by a backend that cannot count GPUs but sees where each loaded
   * model sits (Ollama's `size_vram`); `undefined` on one that counts them.
   */
  accelerated?: boolean;
  /** The download cache on this node, when a backend keeps one there. */
  cache?: {
    claim?: string;
    mountPath?: string;
    /** Models (cache directories) held. */
    models?: number;
    bytesUsed?: number;
    scannedAt?: string;
    /** Network storage visible from every node. */
    shared?: boolean;
    /** Last scan failure; the figures may be stale. */
    error?: string;
  };
};

/** Reasons the GPU capacity of an installation could not be read. */
export type GpuCapacityUnavailableReason = 'forbidden' | 'error';

/**
 * What one serving source contributes. The provider merges these across
 * sources; the UI never sees the individual sources.
 */
export type ServingSourceSnapshot = {
  /** Discovery or reads still in flight (more may appear). */
  isLoading: boolean;
  /** Installations where this source found a serving backend. */
  installations: string[];
  /** The backend per installation in `installations`. */
  backends: Record<string, ServingBackend>;
  /**
   * Every backend any source reports for an installation. Filled by the
   * merge (a single source has one backend per installation): where a KServe
   * CR read and an Ollama model-manager share an installation, `backends`
   * keeps the operating source's label and this keeps both, so a client
   * pointing at a KServe predictor is still recognised as the serving
   * layer's (see {@link resolveClientServing}).
   */
  sourceBackends?: Record<string, ServingBackend[]>;
  /**
   * What the source can do per installation in `installations`. Optional:
   * a source that omits it offers nothing beyond listing there.
   */
  capabilities?: Record<string, ServingCapabilities>;
  /**
   * How the backend loads models, per installation in `installations`, where
   * the source's backend reports it. Optional: a source whose backend says
   * nothing leaves the installation out, and its not-loaded models read as
   * `available`.
   */
  loading?: Record<string, ServingLoading>;
  /**
   * Per installation, the `hostname:port` authorities
   * ({@link endpointAuthority}) on which the backend answers for *every* model
   * it has — a multi-model host such as Ollama's. Lets a client whose endpoint
   * is that host but whose model is not listed be told apart from a client of
   * an external endpoint: the model is gone (or was never pulled), not
   * elsewhere — see {@link resolveClientServing}. The port is part of it
   * because a lab host runs other OpenAI-compatible servers on other ports
   * (a Lemonade server beside Ollama), which are not this backend's. Backends
   * with one endpoint per model (KServe predictors) contribute none. A source
   * lists an installation here only once it has read the installation's
   * models, so a model still loading is never reported gone.
   */
  sharedHosts?: Record<string, string[]>;
  /**
   * Installations with the backend whose served models could not be read
   * (unreachable, or the user lacks permission) — surfaced, never dropped.
   */
  unreachableInstallations: string[];
  servedModels: ServedModel[];
  gpuNodes: GpuNode[];
  /** Installations whose GPU capacity could not be read, with why. */
  gpuCapacityUnavailable: Record<string, GpuCapacityUnavailableReason>;
};

/** Total GPUs on a node: the device plugin's word, else the discovery label. */
export function gpuTotal(node: GpuNode): number | undefined {
  return node.capacity ?? node.labeledCount;
}

/**
 * GPUs still schedulable on a node. Only defined when both sides are known —
 * a node without device-plugin data has no allocatable figure to subtract
 * from, and a node whose pods could not be read has nothing to subtract.
 */
export function gpuFree(node: GpuNode): number | undefined {
  if (node.allocatable === undefined || node.requested === undefined) {
    return undefined;
  }
  return Math.max(0, node.allocatable - node.requested);
}

/**
 * Whether a node is a backend's host rather than a cluster node: its memory
 * budget is the host's memory as the serving layer's pod sees it
 * (`host-meminfo`) or the operator's figure for it (`override`, set where the
 * pod's view is not the host's), and it carries no GPU product, count or
 * device-plugin figure — the backend's API does not expose the accelerator.
 * What model-manager's Ollama driver reports for the machine it proxies.
 */
export function isHostMemoryNode(
  node: Pick<GpuNode, 'memoryBudgetSource'>,
): boolean {
  return (
    node.memoryBudgetSource === 'host-meminfo' ||
    node.memoryBudgetSource === 'override'
  );
}

/**
 * What is known about a client (a kagent ModelConfig) when asking which served
 * model it fronts. Every field is optional; more fields give a more exact
 * answer.
 */
export type ServedModelLookup = {
  /** The client's base URL / host (`spec.openAI.baseUrl`, `spec.ollama.host`). */
  endpoint?: string;
  /** The provider model id the client asks for (`spec.model`). */
  model?: string;
  /** The client's own identity, to match a backend-created ModelConfig exactly. */
  modelConfig?: { name: string; namespace?: string };
};

/** The lookup for a kagent ModelConfig: its endpoint, model id and identity. */
export function clientLookupOf(modelConfig: ModelConfig): ServedModelLookup {
  return {
    endpoint: modelConfig.getEndpoint(),
    model: modelConfig.getModel(),
    modelConfig: {
      name: modelConfig.getName(),
      namespace: modelConfig.getNamespace(),
    },
  };
}

/**
 * The served model a client points at, among `candidates` (which the caller
 * has already narrowed to the client's installation).
 *
 * Three rules, most exact first:
 *
 * 1. A candidate whose backend-created `modelConfig` **is** this client wins
 *    outright — the backend said so.
 * 2. Otherwise match the endpoint's hostname (scheme, port and the `/v1` path
 *    do not matter). A host that serves several models (an Ollama host, one
 *    endpoint for every tag) needs the client's `model` to tell them apart:
 *    among the candidates on the host, the one whose name equals `model`.
 * 3. With exactly one candidate on the host and no name match, it is the one
 *    — a single-model server (a vLLM InferenceService) names its model
 *    however it likes, and the ModelConfig's `model` need not equal the
 *    InferenceService name.
 *
 * `undefined` when the endpoint is empty (provider default), not a URL, or
 * fronts nothing known — an external provider, a served model on another
 * installation, or a shared host where nothing carries the asked-for name.
 */
export function findServedModel(
  lookup: ServedModelLookup,
  candidates: ServedModel[],
): ServedModel | undefined {
  if (lookup.modelConfig) {
    const { name, namespace } = lookup.modelConfig;
    const exact = candidates.find(
      model =>
        model.modelConfig &&
        model.modelConfig.name === name &&
        (namespace === undefined || model.modelConfig.namespace === namespace),
    );
    if (exact) {
      return exact;
    }
  }

  const hostname = urlHostname(lookup.endpoint);
  if (!hostname) {
    return undefined;
  }
  const onHost = candidates.filter(model =>
    model.endpointHosts.includes(hostname),
  );
  if (onHost.length === 0) {
    return undefined;
  }
  if (lookup.model) {
    const named = onHost.find(model => model.name === lookup.model);
    if (named) {
      return named;
    }
  }
  return onHost.length === 1 ? onHost[0] : undefined;
}

/**
 * {@link findServedModel} by endpoint alone. Kept for callers that know
 * nothing but a base URL; prefer the lookup form where the client's model id
 * is at hand, or a multi-model host cannot be resolved.
 */
export function findServedModelForEndpoint(
  endpoint: string | undefined,
  candidates: ServedModel[],
): ServedModel | undefined {
  return findServedModel({ endpoint }, candidates);
}

/**
 * Whether two rows *of different sources* describe the same served model: the
 * same installation and backend, answering on a common hostname — a KServe
 * InferenceService read as a CR and the same predictor in a model-manager's
 * inventory both list `<name>-predictor.<namespace>.svc.cluster.local`. Rows
 * without an endpoint (a cached model nobody serves) never coincide. Only
 * meaningful across sources: within one source, an Ollama host lists every
 * tag on the same hostname, and those are different models.
 */
export function isSameServedModel(a: ServedModel, b: ServedModel): boolean {
  return (
    a.installation === b.installation &&
    a.backend === b.backend &&
    a.endpointHosts.some(host => b.endpointHosts.includes(host))
  );
}

/**
 * One row from two sources' views of the same served model. The earlier row
 * (the CR read — identity, status, placement as the cluster reports them)
 * keeps every field it has; the later one (the operating source) fills in
 * what it lacks — size, features, the cache, the ModelConfig it knows, the
 * reference it operates by — and the row is operable if either side is. One
 * row, one status, one actions menu.
 */
export function overlayServedModel(
  base: ServedModel,
  overlay: ServedModel,
): ServedModel {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    // The status and its explanation come from one source: the base's.
    if (
      value === undefined ||
      key === 'endpointHosts' ||
      key === 'operable' ||
      key === 'readinessMessage'
    ) {
      continue;
    }
    if (merged[key] === undefined) {
      merged[key] = value;
    }
  }
  return {
    ...(merged as ServedModel),
    endpointHosts: Array.from(
      new Set([...base.endpointHosts, ...overlay.endpointHosts]),
    ),
    operable: base.operable || overlay.operable || undefined,
  };
}

/**
 * Merge per-source snapshots. Later sources win the `backends` label for an
 * installation both claim; capabilities are OR-ed per flag, so an
 * installation offers what any of its sources can do — the CR source's GPU
 * panel next to the model-manager's pull and load.
 *
 * Served models are concatenated (a KServe InferenceService and an Ollama
 * model on the same installation both render), except that a later source's
 * row for a model an earlier source already lists — the same predictor, by
 * hostname ({@link isSameServedModel}) — is folded into that row
 * ({@link overlayServedModel}) rather than shown twice. GPU nodes are
 * likewise one row per node, the later source's figures filling in or
 * refreshing the earlier's.
 */
export function mergeServingSnapshots(
  snapshots: ServingSourceSnapshot[],
): ServingSourceSnapshot {
  const backends: Record<string, ServingBackend> = {};
  const sourceBackends: Record<string, ServingBackend[]> = {};
  const capabilities: Record<string, ServingCapabilities> = {};
  const loading: Record<string, ServingLoading> = {};
  const sharedHosts: Record<string, string[]> = {};
  const gpuCapacityUnavailable: Record<string, GpuCapacityUnavailableReason> =
    {};
  const unreachable = new Set<string>();
  const servedModels: ServedModel[] = [];
  const gpuNodes = new Map<string, GpuNode>();
  for (const snapshot of snapshots) {
    Object.assign(backends, snapshot.backends);
    for (const [installation, backend] of Object.entries(snapshot.backends)) {
      const known = sourceBackends[installation] ?? [];
      if (!known.includes(backend)) {
        sourceBackends[installation] = [...known, backend];
      }
    }
    // Like the backend label: the later source's word on how models load.
    Object.assign(loading, snapshot.loading ?? {});
    for (const [installation, hosts] of Object.entries(
      snapshot.sharedHosts ?? {},
    )) {
      sharedHosts[installation] = Array.from(
        new Set([...(sharedHosts[installation] ?? []), ...hosts]),
      );
    }
    Object.assign(gpuCapacityUnavailable, snapshot.gpuCapacityUnavailable);
    snapshot.unreachableInstallations.forEach(name => unreachable.add(name));
    for (const [installation, flags] of Object.entries(
      snapshot.capabilities ?? {},
    )) {
      const merged = {
        ...(capabilities[installation] ?? NO_SERVING_CAPABILITIES),
      };
      for (const key of Object.keys(flags) as (keyof ServingCapabilities)[]) {
        merged[key] = merged[key] || flags[key];
      }
      capabilities[installation] = merged;
    }

    // Fold only onto rows of *earlier* sources: within one snapshot every
    // row is its own model, whatever hosts they share.
    const earlier = servedModels.length;
    for (const row of snapshot.servedModels) {
      let index = -1;
      for (let i = 0; i < earlier; i += 1) {
        if (isSameServedModel(servedModels[i], row)) {
          index = i;
          break;
        }
      }
      if (index === -1) {
        servedModels.push(row);
      } else {
        servedModels[index] = overlayServedModel(servedModels[index], row);
      }
    }

    for (const node of snapshot.gpuNodes) {
      const existing = gpuNodes.get(node.id);
      if (!existing) {
        gpuNodes.set(node.id, node);
        continue;
      }
      const merged: Record<string, unknown> = { ...existing };
      for (const [key, value] of Object.entries(node)) {
        if (value !== undefined) {
          merged[key] = value;
        }
      }
      gpuNodes.set(node.id, merged as GpuNode);
    }
  }
  return {
    isLoading: snapshots.some(snapshot => snapshot.isLoading),
    installations: Object.keys(backends),
    backends,
    sourceBackends,
    capabilities,
    loading,
    sharedHosts,
    unreachableInstallations: Array.from(unreachable).sort(),
    servedModels,
    gpuNodes: Array.from(gpuNodes.values()),
    gpuCapacityUnavailable,
  };
}

const DEFAULT_PORT: Record<string, string> = { 'http:': '80', 'https:': '443' };

/**
 * The `hostname:port` a URL addresses, lower-cased, the scheme's default port
 * filled in — `http://172.21.0.1:11434/v1` → `172.21.0.1:11434`,
 * `https://x.example/v1` → `x.example:443`. `undefined` for anything that is
 * not a URL with a host. Where {@link urlHostname} says *which machine*, this
 * says *which server on it*.
 */
export function endpointAuthority(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }
  try {
    const parsed = new URL(url);
    if (!parsed.hostname) {
      return undefined;
    }
    const port = parsed.port || DEFAULT_PORT[parsed.protocol];
    return port
      ? `${parsed.hostname.toLowerCase()}:${port}`
      : parsed.hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

/**
 * The InferenceService a KServe predictor hostname belongs to
 * (`<name>-predictor.<namespace>`, optionally `.svc` or `.svc.cluster.local`),
 * else `undefined`. The shape KServe gives every predictor Service, and what a
 * ModelConfig's `baseUrl` names when it points at one.
 */
export function predictorOfHostname(
  hostname: string | undefined,
): { name: string; namespace: string } | undefined {
  if (!hostname) {
    return undefined;
  }
  const match = /^(.+)-predictor\.([^.]+)(?:\.svc(?:\.cluster\.local)?)?$/.exec(
    hostname,
  );
  return match ? { name: match[1], namespace: match[2] } : undefined;
}

/**
 * What a client (a kagent ModelConfig) gets when it talks to its endpoint, as
 * far as the serving layer can tell: the served model it fronts with that
 * model's readiness — or `notServing` when the endpoint is the serving layer's
 * but nothing there answers for the model. The Model configs view, the model
 * detail, the Agents view and the session composer all read this.
 */
export type ClientServingState = {
  installation: string;
  backend: ServingBackend;
  readiness: ServedModelReadiness;
  /**
   * Backend-native name of the model the client asks for: an Ollama tag, an
   * InferenceService name.
   */
  name: string;
  /** Namespace, for backends that have one. */
  namespace?: string;
  /** Why, in the backend's words where it has any, else the vocabulary's. */
  message: string;
  /** The served model, when the backend lists one. Absent for a model that is gone. */
  model?: ServedModel;
};

/** {@link ClientServingState} without the row — plain data for a table row. */
export type ClientServingSummary = Omit<ClientServingState, 'model'>;

export function summarizeClientServing(
  state: ClientServingState,
): ClientServingSummary {
  const { model: _model, ...summary } = state;
  return summary;
}

/** What {@link resolveClientServing} needs to know about the client's installation. */
export type ClientServingContext = {
  installation: string;
  /** The installation's served models. */
  candidates: ServedModel[];
  /** The backend(s) the installation's sources report. */
  backends: ServingBackend[];
  /**
   * The installation's multi-model hosts as `hostname:port` authorities —
   * `ServingSourceSnapshot.sharedHosts`.
   */
  sharedHosts: string[];
};

/**
 * Resolve a client to the serving layer.
 *
 * 1. A served model the client fronts ({@link findServedModel}) — its
 *    readiness is the client's.
 * 2. Otherwise, an endpoint on one of the installation's multi-model hosts
 *    (Ollama's, host *and* port) is a client of that backend whose model is
 *    not there — deleted while the ModelConfig remained, or never pulled:
 *    `notServing`, named after the client's `model` (the tag a Pull would
 *    fetch). Only what the source declared counts: another server on the same
 *    machine (a different port) is not this backend, whatever the rows' hosts.
 * 3. Otherwise, an endpoint shaped like a KServe predictor
 *    ({@link predictorOfHostname}) on an installation with a KServe backend is
 *    an InferenceService that is stopped or was never created: `notServing`,
 *    named after the InferenceService.
 * 4. Anything else — a provider default, an external endpoint, a host nobody
 *    here knows — is not the serving layer's business: `undefined`.
 */
export function resolveClientServing(
  lookup: ServedModelLookup,
  context: ClientServingContext,
): ClientServingState | undefined {
  const { installation, candidates } = context;
  const served = findServedModel(lookup, candidates);
  if (served) {
    return {
      installation,
      backend: served.backend,
      readiness: served.readiness,
      name: served.name,
      namespace: served.namespace,
      message:
        served.readinessMessage ??
        SERVED_MODEL_READINESS[served.readiness].description,
      model: served,
    };
  }

  const hostname = urlHostname(lookup.endpoint);
  const authority = endpointAuthority(lookup.endpoint);
  if (!hostname || !authority) {
    return undefined;
  }

  if (context.sharedHosts.includes(authority)) {
    // The one backend that answers on a shared host: the installation's
    // multi-model one (KServe predictors are never shared).
    const backend =
      context.backends.find(name => name !== 'kserve') ?? 'ollama';
    const name = lookup.model ?? '';
    return {
      installation,
      backend,
      readiness: 'notServing',
      name,
      message: `${SERVING_BACKEND_LABEL[backend]} ${name || '(unnamed)'} is not on the backend at ${authority} — deleted, or never pulled. Agents on this model config fail until it is pulled again.`,
    };
  }

  const predictor = predictorOfHostname(hostname);
  if (predictor && context.backends.includes('kserve')) {
    return {
      installation,
      backend: 'kserve',
      readiness: 'notServing',
      name: predictor.name,
      namespace: predictor.namespace,
      message: `InferenceService ${predictor.namespace}/${predictor.name} is not serving — stopped, or never created. Agents on this model config fail until it is served again.`,
    };
  }

  return undefined;
}

/**
 * The one-click fix a client's state admits, given what its installation can
 * do. `load` — bring a downloaded model into memory / create the
 * InferenceService for it (model-manager's load, by the reference it lists
 * the model under); `pull` — fetch a model that is gone from a backend that
 * pulls by reference (the client's own `model`). `undefined` when nothing
 * applies: ready, still converging, failing with a message of its own, or a
 * backend without the capability — the Serving view is the fallback.
 *
 * `operatingBackend` is the installation's `backends` label — the backend of
 * the source that *acts* (a model-manager). A gone InferenceService is only
 * offered its load when that source is KServe: on an installation whose CRs
 * are read next to an Ollama model-manager, the `load` flag is Ollama's and
 * would fail on an InferenceService name.
 */
export type ServingShortcut = { kind: 'load' | 'pull'; ref: string };

export function servingShortcutFor(
  state: ClientServingState,
  capabilities: ServingCapabilities,
  operatingBackend?: ServingBackend,
): ServingShortcut | undefined {
  const { model } = state;
  if (model) {
    const notRunning =
      state.readiness === 'idle' ||
      state.readiness === 'available' ||
      state.readiness === 'notServing';
    if (
      notRunning &&
      model.operable &&
      model.loaded === false &&
      capabilities.load
    ) {
      return { kind: 'load', ref: model.managerRef ?? model.name };
    }
    return undefined;
  }
  if (state.readiness !== 'notServing' || !state.name) {
    return undefined;
  }
  if (state.backend === 'kserve') {
    // A gone InferenceService comes back through the backend's load of the
    // name it was served under (the preset, for one model-manager created) —
    // when the backend that loads is KServe's model-manager.
    return capabilities.load && operatingBackend === 'kserve'
      ? { kind: 'load', ref: state.name }
      : undefined;
  }
  return capabilities.pull ? { kind: 'pull', ref: state.name } : undefined;
}
