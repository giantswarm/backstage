// The backend-agnostic shape of "a model being served" for the Models tab's
// Serving view, and the pure helpers over it.
//
// This is the seam between the UI and wherever the serving data comes from. A
// *serving source* (see `components/ServingProvider`) turns one backend's own
// objects into these types: today the KServe source reads LLMInferenceService,
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
 * Serving backends a source can report. `kserve` — LLMInferenceServices read
 * as CRs, or model-manager's KServe backend; `ollama` — model-manager's
 * host-Ollama backend; `lemonade` — model-manager's Lemonade Server backend
 * (FastFlowLM on AMD Ryzen AI NPUs, llama.cpp). One model-manager may run
 * several of them on one installation (0.17 on), so an installation can have
 * several backends at once — rows, capabilities and loading semantics are
 * kept per (installation, backend), see {@link servingGroupKey}.
 */
export type ServingBackend = 'kserve' | 'ollama' | 'lmstudio' | 'lemonade';

/** How each backend is named in prose ("Served by Ollama model …"). */
export const SERVING_BACKEND_LABEL: Record<ServingBackend, string> = {
  kserve: 'LLMInferenceService',
  ollama: 'Ollama model',
  lmstudio: 'LM Studio model',
  lemonade: 'Lemonade model',
};

/**
 * The key of one backend on one installation — what a Serving group is, and
 * what per-backend capabilities and loading semantics are filed under when an
 * installation runs several backends behind one model-manager.
 */
export function servingGroupKey(
  installation: string,
  backend: ServingBackend,
): string {
  return `${installation}/${backend}`;
}

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
 *   ModelConfig) points at it: a KServe LLMInferenceService stopped or never
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
 *   backend is unhealthy; `readinessMessage` says which, and
 *   `readinessReason` gives the backend's word for it.
 * - `pending` — no verdict yet ("not known", not "broken"), or the workload
 *   pod waits for a node or an image (`readinessReason`: `Unschedulable`,
 *   `ImagePullBackOff`).
 * - `terminating` — being deleted: a Stop serving in progress, or a deletion
 *   from elsewhere; the row leaves the list once it completes.
 */
export type ServedModelReadiness =
  | 'ready'
  | 'idle'
  | 'notServing'
  | 'available'
  | 'downloading'
  | 'notReady'
  | 'pending'
  | 'terminating';

/** The states a served model's step can be in — the managers' vocabulary. */
export type ServedModelStepState = 'pending' | 'inProgress' | 'done' | 'failed';

/**
 * One step of a served model's timeline as the backend reports it (KServe
 * through model-manager 0.24.0: `scheduling`, `nodeStarting`,
 * `downloadingWeights`, `pullingImage`, `loading`, `routing`, `ready`). The
 * weights step carries the size, the progress where a cache agent reports
 * it, and — once done — whether the cache already held them.
 */
export type ServedModelStep = {
  name: string;
  state: ServedModelStepState;
  since?: string;
  finishedAt?: string;
  reason?: string;
  message?: string;
  bytesTotal?: number;
  bytesCompleted?: number;
  cached?: boolean;
};

export type ServedModelReadinessPresentation = {
  /** The status label. */
  label: string;
  /** What the status means; picks the colour (see ui-react's `StatusLabel`). */
  intent: StatusLabelIntent;
  /** The state in a sentence: "LLMInferenceService x is <phrase>". */
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
  terminating: {
    label: 'Stopping',
    intent: 'neutral',
    phrase: 'being stopped',
    description:
      'Being deleted. The row leaves the list once the serving object is gone.',
  },
};

/**
 * The order the Serving page lists models in — what a Status column sorted
 * ascending means. What runs first: `ready`. Then what needs attention:
 * `notServing` and `notReady`, a `pending` rollout, a model being stopped.
 * Then what is not running: `idle` (an agent on it still works — the first
 * request loads it), `downloading`, `available`. A person opening the page
 * reads what works, then what to fix, then what could be served, and the
 * models needing attention are never pushed down by a host's many idle ones;
 * alphabetical order on the words would be meaningless.
 */
export const SERVED_MODEL_READINESS_ORDER: Record<
  ServedModelReadiness,
  number
> = {
  ready: 0,
  notServing: 1,
  notReady: 2,
  pending: 3,
  terminating: 4,
  idle: 5,
  downloading: 6,
  available: 7,
};

/**
 * Whether a client (an agent) pointing at a model in this state fails at its
 * first request — what the session composer warns about. `idle` is not a
 * failure (the request loads the model), nor is `available` (no claim is made
 * about what a request does when the semantics are unknown); `terminating`
 * is one — the model is going away.
 */
export function isServingFailure(readiness: ServedModelReadiness): boolean {
  return (
    readiness === 'notServing' ||
    readiness === 'notReady' ||
    readiness === 'terminating'
  );
}

/**
 * A backend's explanation without the reason it starts with. model-manager
 * (and KServe's failure info) put the reason and the text on one line —
 * `Unschedulable 0/3 nodes are available…`, `ModelLoadFailed: CUDA out of
 * memory` — and once the reason is a label of its own, the line would say it
 * twice. A message that is the reason alone leaves nothing: `undefined`, for
 * the caller's own sentence. A message that merely begins with the reason's
 * letters (`Pending` in `PendingUpdate…`) is left alone.
 */
export function explanationWithoutReason(
  message: string | undefined,
  reason: string | undefined,
): string | undefined {
  if (!message) {
    return undefined;
  }
  if (!reason || !message.startsWith(reason)) {
    return message;
  }
  const rest = message.slice(reason.length);
  if (rest && !/^[\s:]/.test(rest)) {
    return message;
  }
  return rest.replace(/^[\s:]+/, '').trim() || undefined;
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
  /** Backend-native identity: the LLMInferenceService name, an Ollama tag. */
  name: string;
  /** Namespace, for backends that have one. */
  namespace?: string;
  /** Where the weights come from: `hf://…`, `pvc://…`, an Ollama tag. */
  modelSource?: string;
  /** What serves it, where the backend says: `ollama 0.33.2`, `lemonade 11.9.0`, …; `undefined` on KServe (the well-known template's). */
  runtime?: string;
  /**
   * What the backend runs *this* model with, on backends that have several
   * engines (Lemonade: the recipe — `flm` is FastFlowLM on the NPU,
   * `llamacpp`, …). `undefined` where the backend has one engine or the
   * runtime says.
   */
  engine?: string;
  /**
   * Where a loaded model runs as the backend reports it (Lemonade: `npu`,
   * `gpu`, `cpu`, or several such as `gpu npu`). `undefined` when the backend
   * does not say.
   */
  device?: string;
  /**
   * Whether a loaded model is pinned against the backend's slot eviction
   * (Lemonade: loaded with keepAlive -1). `undefined` where the notion does
   * not exist.
   */
  pinned?: boolean;
  readiness: ServedModelReadiness;
  /** The backend's own explanation of a non-ready state, for the tooltip. */
  readinessMessage?: string;
  /**
   * The backend's short word for a non-ready state, shown next to the label:
   * the Ready condition's reason (`HTTPRoutesNotReady`), a failed load's, or
   * the workload pod's while it waits (`Unschedulable`, `ImagePullBackOff`).
   * `readinessMessage` is then the explanation without it. Absent on a ready
   * row, and on backends that name none.
   */
  readinessReason?: string;
  /**
   * Where the serve stands, in the backend's vocabulary (KServe through
   * model-manager 0.24.0 on: `scheduling` … `ready`, `failed`,
   * `terminating`). Absent on backends without a serve lifecycle.
   */
  phase?: string;
  /** The serve's timeline, one step per phase in order; absent where `phase` is. */
  steps?: ServedModelStep[];
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
   * Every URL host this model answers on, lower-cased — a `hostname`, or a
   * `hostname:port` authority ({@link endpointAuthority}). What a client base
   * URL is matched against to tell which served model it fronts
   * ({@link findServedModel}): a bare hostname takes clients on any port of
   * the host — right for a server that has the name to itself (a KServe
   * workload's Service DNS names name one model); an
   * authority takes only clients of that port — required on a host shared
   * with other servers (Ollama on `172.21.0.1:11434` beside a Lemonade server
   * on `:13305`, whose clients are not Ollama's).
   */
  endpointHosts: string[];
  /** Friendly name, when the backend records one (a preset's display name). */
  displayName?: string;
  /** The serving preset this model was served from, when the backend records it. */
  preset?: string;
  /** On-disk size of the weights, when the backend reports it. */
  sizeBytes?: number;
  /**
   * Whether the model is in memory / running right now. `undefined` when the
   * backend has no such notion (a bare LLMInferenceService read as a CR).
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
   * recognises as somebody else's wiring of the same served model (a
   * hand-written one), which it never updates or deletes. With the controller's
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
    /**
     * `spec.model` — the model id the ModelConfig sends the provider, which on
     * a vLLM workload is the name the model is served under (the Hugging
     * Face repository, not the serving object's name). What a try of the
     * served model sends too.
     */
    model?: string;
  };
  /**
   * The reference the operating source (model-manager) knows this model by
   * and takes in its requests — an Ollama tag, a Hugging Face repository. Set
   * by that source only; a row merged from a CR read and a model-manager
   * inventory keeps the CR's `name` (the LLMInferenceService) and this reference
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
  /** KServe: the cache directory holding the weights — the LLMInferenceService name the storage-initializer uses. */
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
  /** Stable unique key: installation + node name (+ backend for a backend host). */
  id: string;
  installation: string;
  /** The backend that reported the node, when one did (a backend host is one per backend). */
  backend?: ServingBackend;
  name: string;
  ready: boolean;
  /** `nvidia.com/gpu.product` from gpu-feature-discovery. */
  product?: string;
  /** `nvidia.com/gpu.memory` (MiB per GPU) from gpu-feature-discovery. */
  memoryMiB?: number;
  /** `nvidia.com/gpu.count` from gpu-feature-discovery. */
  labeledCount?: number;
  /**
   * The extended resource the node advertises its accelerators as
   * (`nvidia.com/gpu`, `amd.com/gpu`, `google.com/tpu`, …) — what `capacity`,
   * `allocatable` and `requested` count. `undefined` when no device plugin
   * advertises one.
   */
  resource?: string;
  /**
   * What the device plugin advertises. `undefined` = the node advertises no
   * accelerator resource at all — no device plugin, or a node whose GPUs are
   * only known from labels. A valid state, not an error.
   */
  capacity?: number;
  allocatable?: number;
  /**
   * Accelerators (`resource`) requested by non-terminal pods bound to this
   * node. `undefined` until pods were read (or when they could not be).
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
  /**
   * Whether the serving backend can place a model on this node — ready,
   * inside the installation's serving node selector, able to mount the model
   * cache. model-manager (0.11 on) judges every node it lists; `undefined`
   * from a source that does not (a cluster read, an older model-manager),
   * and the node is then a target as far as anyone knows.
   */
  eligible?: boolean;
  /** Why `eligible` is false, in the backend's words. */
  eligibilityReason?: string;
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
  /**
   * Installations where this source found a serving layer: a serving
   * backend, or a model-manager that answers but runs no backend yet.
   */
  installations: string[];
  /**
   * The (default) backend per installation in `installations` — absent for
   * one whose model-manager has no backend registered yet.
   */
  backends: Record<string, ServingBackend>;
  /**
   * Every backend any source reports for an installation. Filled by the
   * merge (a single source has one backend per installation): where a KServe
   * CR read and an Ollama model-manager share an installation, `backends`
   * keeps the operating source's label and this keeps both, so a client
   * pointing at a KServe workload is still recognised as the serving
   * layer's (see {@link resolveClientServing}).
   */
  sourceBackends?: Record<string, ServingBackend[]>;
  /**
   * What the source can do per installation in `installations`. Optional:
   * a source that omits it offers nothing beyond listing there. With several
   * backends on one installation this is the OR over them; the per-backend
   * flags are in `backendCapabilities`.
   */
  capabilities?: Record<string, ServingCapabilities>;
  /**
   * What each backend can do, per installation and backend: the flags a
   * row's controls follow when an installation runs several backends behind
   * one model-manager (presets on its kserve backend, none on its ollama
   * one). Optional; `capabilities` stands in for a backend not listed.
   */
  backendCapabilities?: Record<
    string,
    Partial<Record<ServingBackend, ServingCapabilities>>
  >;
  /**
   * How each backend loads models, per installation and backend, where the
   * backend reports it. Optional; `loading` stands in for a backend not
   * listed.
   */
  backendLoading?: Record<
    string,
    Partial<Record<ServingBackend, ServingLoading>>
  >;
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
   * with one endpoint per model (KServe workloads) contribute none. A source
   * lists an installation here only once it has read the installation's
   * models, so a model still loading is never reported gone.
   */
  sharedHosts?: Record<string, string[]>;
  /**
   * Per installation, the `hostname:port` authorities of its models Gateway
   * — the one host every routed KServe model answers on, each under its own
   * path `/<namespace>/<name>`. Lets a client on that host be resolved to its
   * model by the path, and one whose path names no listed model be told the
   * LLMInferenceService is gone — see {@link findServedModel} and
   * {@link resolveClientServing}. From the installation's model-serving
   * discovery config; absent on an installation without a Gateway.
   */
  gatewayHosts?: Record<string, string[]>;
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
 * (`host-meminfo`), the operator's figure for it (`override`, set where the
 * pod's view is not the host's), or what the host's own server reports
 * (`system-info`, Lemonade). What model-manager's Ollama and Lemonade drivers
 * report for the machine they proxy; the Ollama host carries no GPU product,
 * count or device-plugin figure (its API does not expose the accelerator),
 * the Lemonade host names the accelerators Lemonade enumerates.
 */
export function isHostMemoryNode(
  node: Pick<GpuNode, 'memoryBudgetSource'>,
): boolean {
  return (
    node.memoryBudgetSource === 'host-meminfo' ||
    node.memoryBudgetSource === 'override' ||
    node.memoryBudgetSource === 'system-info'
  );
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
 * Whether a client URL lands on one of the hosts a served model answers on
 * (`endpointHosts`): listed as its `hostname:port` authority, or as its bare
 * hostname (any port).
 */
function isOnEndpoint(
  model: ServedModel,
  hostname: string,
  authority: string,
): boolean {
  return (
    model.endpointHosts.includes(authority) ||
    model.endpointHosts.includes(hostname)
  );
}

/**
 * Whether a node row is capacity for serving models — what the GPU capacity
 * view lists: a backend host ({@link isHostMemoryNode}, whose accelerator the
 * backend's API cannot see), or a cluster node with any evidence of an
 * accelerator — a device plugin advertising one, a discovery label (product,
 * memory, count), or the serving backend's own verdict on it (`eligible`,
 * which model-manager gives only for accelerator nodes). A CPU-only node a
 * backend lists with an allocatable-memory budget has none of these: nothing
 * can be served there, and {@link mergeServingSnapshots} drops it.
 */
export function isAcceleratorCapacityRow(node: GpuNode): boolean {
  return (
    isHostMemoryNode(node) ||
    node.accelerated !== undefined ||
    node.eligible !== undefined ||
    node.resource !== undefined ||
    node.capacity !== undefined ||
    node.product !== undefined ||
    node.memoryMiB !== undefined ||
    (node.labeledCount ?? 0) > 0
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
 * 2. Otherwise match the endpoint's host against each candidate's
 *    `endpointHosts`: the URL's `hostname:port` authority
 *    ({@link endpointAuthority}, the scheme's default port filled in — so
 *    `http://x/v1` is `x:80`) or its bare hostname, whichever the candidate
 *    lists (scheme and the `/v1` path never matter; the port matters exactly
 *    when the candidate says so). A server that serves several models (an
 *    Ollama host, one endpoint for every tag) needs the client's `model` to
 *    tell them apart: among the candidates on the server, the one whose name
 *    equals `model`.
 * 3. Otherwise the endpoint's path: on the models Gateway every routed KServe
 *    model answers on one host, each under `/<namespace>/<name>` — the
 *    candidate of that namespace and name is the one.
 * 4. With exactly one candidate on the server and no name or path match, it
 *    is the one — a single-model server (a vLLM workload) names its model
 *    however it likes, and the ModelConfig's `model` need not equal the
 *    LLMInferenceService name. Not on a server the installation's source
 *    declared multi-model (`options.sharedHosts`, Ollama's — the same
 *    authorities `ServingSourceSnapshot.sharedHosts` carries): there a client
 *    that names no listed model fronts none, however few are listed — its
 *    model is gone, which {@link resolveClientServing} reports.
 *
 * `undefined` when the endpoint is empty (provider default), not a URL, or
 * fronts nothing known — an external provider, a served model on another
 * installation, another server on a port of the same machine, or a shared
 * server where nothing carries the asked-for name.
 */
export function findServedModel(
  lookup: ServedModelLookup,
  candidates: ServedModel[],
  options: { sharedHosts?: string[] } = {},
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
  const authority = endpointAuthority(lookup.endpoint);
  if (!hostname || !authority) {
    return undefined;
  }
  const onServer = candidates.filter(model =>
    isOnEndpoint(model, hostname, authority),
  );
  if (onServer.length === 0) {
    return undefined;
  }
  if (lookup.model) {
    const named = onServer.find(model => model.name === lookup.model);
    if (named) {
      return named;
    }
  }
  const routed = servedObjectOfRoute(lookup.endpoint);
  if (routed) {
    const byRoute = onServer.find(
      model =>
        model.namespace === routed.namespace && model.name === routed.name,
    );
    if (byRoute) {
      return byRoute;
    }
  }
  if (options.sharedHosts?.includes(authority)) {
    return undefined;
  }
  return onServer.length === 1 ? onServer[0] : undefined;
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
 * Whether two rows *of different sources* describe the same served model on
 * the same installation and backend. A row with a namespace is a Kubernetes
 * object — a KServe LLMInferenceService read as a CR, the same object in a
 * model-manager's inventory — and is the same model as another such row of
 * the same namespace and name: never by host, since every routed model
 * answers on the models Gateway's one host. Rows without a namespace coincide
 * when they answer on a common host; rows without an endpoint (a cached model
 * nobody serves) never do. Only meaningful across sources: within one source,
 * an Ollama host lists every tag on the same authority, and those are
 * different models.
 */
export function isSameServedModel(a: ServedModel, b: ServedModel): boolean {
  if (a.installation !== b.installation || a.backend !== b.backend) {
    return false;
  }
  if (a.namespace !== undefined || b.namespace !== undefined) {
    return a.namespace === b.namespace && a.name === b.name;
  }
  return a.endpointHosts.some(host => b.endpointHosts.includes(host));
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
    // The status, its reason and its explanation come from one source: the
    // base's.
    if (
      value === undefined ||
      key === 'endpointHosts' ||
      key === 'operable' ||
      key === 'readinessMessage' ||
      key === 'readinessReason'
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
 * Every backend the snapshot reports for an installation: the merge's list
 * where it has one, else the installation's label alone. Empty for an
 * installation whose model-manager runs no backend yet.
 */
export function backendsOn(
  snapshot: Pick<ServingSourceSnapshot, 'backends' | 'sourceBackends'>,
  installation: string,
): ServingBackend[] {
  const listed = snapshot.sourceBackends?.[installation];
  if (listed) {
    return listed;
  }
  const label = snapshot.backends[installation];
  return label ? [label] : [];
}

/**
 * Merge per-source snapshots. Later sources win the `backends` label for an
 * installation both claim; capabilities are OR-ed per flag, so an
 * installation offers what any of its sources can do — the CR source's GPU
 * panel next to the model-manager's pull and load.
 *
 * Served models are concatenated (a KServe LLMInferenceService and an Ollama
 * model on the same installation both render), except that a later source's
 * row for a model an earlier source already lists — the same object
 * ({@link isSameServedModel}) — is folded into that row
 * ({@link overlayServedModel}) rather than shown twice. GPU nodes are
 * likewise one row per node, the later source's figures filling in or
 * refreshing the earlier's — and only rows that are accelerator capacity
 * ({@link isAcceleratorCapacityRow}) come out: a model-manager lists every
 * cluster node it budgets, CPU-only ones included, and those are not
 * capacity for serving models.
 */
export function mergeServingSnapshots(
  snapshots: ServingSourceSnapshot[],
): ServingSourceSnapshot {
  const backends: Record<string, ServingBackend> = {};
  const sourceBackends: Record<string, ServingBackend[]> = {};
  const capabilities: Record<string, ServingCapabilities> = {};
  const backendCapabilities: Record<
    string,
    Partial<Record<ServingBackend, ServingCapabilities>>
  > = {};
  const loading: Record<string, ServingLoading> = {};
  const backendLoading: Record<
    string,
    Partial<Record<ServingBackend, ServingLoading>>
  > = {};
  const sharedHosts: Record<string, string[]> = {};
  const gatewayHosts: Record<string, string[]> = {};
  const gpuCapacityUnavailable: Record<string, GpuCapacityUnavailableReason> =
    {};
  const unreachable = new Set<string>();
  const servedModels: ServedModel[] = [];
  const gpuNodes = new Map<string, GpuNode>();
  // Every installation any source lists, in source order — not the keys of
  // the label map: a model-manager with no backend yet has no label and is a
  // serving layer all the same.
  const installations = new Set<string>();
  for (const snapshot of snapshots) {
    snapshot.installations.forEach(name => installations.add(name));
    Object.assign(backends, snapshot.backends);
    for (const [installation, backend] of Object.entries(snapshot.backends)) {
      const known = sourceBackends[installation] ?? [];
      if (!known.includes(backend)) {
        sourceBackends[installation] = [...known, backend];
      }
    }
    // A source that runs several backends on one installation (a
    // model-manager 0.17) names them all; every one has a say there.
    for (const [installation, list] of Object.entries(
      snapshot.sourceBackends ?? {},
    )) {
      const known = sourceBackends[installation] ?? [];
      sourceBackends[installation] = [
        ...known,
        ...list.filter(backend => !known.includes(backend)),
      ];
    }
    // Like the backend label: the later source's word on how models load.
    Object.assign(loading, snapshot.loading ?? {});
    for (const [installation, perBackend] of Object.entries(
      snapshot.backendLoading ?? {},
    )) {
      backendLoading[installation] = {
        ...(backendLoading[installation] ?? {}),
        ...perBackend,
      };
    }
    for (const [installation, perBackend] of Object.entries(
      snapshot.backendCapabilities ?? {},
    )) {
      const known = backendCapabilities[installation] ?? {};
      for (const [backend, flags] of Object.entries(perBackend) as [
        ServingBackend,
        ServingCapabilities,
      ][]) {
        const merged = { ...(known[backend] ?? NO_SERVING_CAPABILITIES) };
        for (const flag of Object.keys(
          flags,
        ) as (keyof ServingCapabilities)[]) {
          merged[flag] = merged[flag] || flags[flag];
        }
        known[backend] = merged;
      }
      backendCapabilities[installation] = known;
    }
    for (const [installation, hosts] of Object.entries(
      snapshot.sharedHosts ?? {},
    )) {
      sharedHosts[installation] = Array.from(
        new Set([...(sharedHosts[installation] ?? []), ...hosts]),
      );
    }
    for (const [installation, hosts] of Object.entries(
      snapshot.gatewayHosts ?? {},
    )) {
      gatewayHosts[installation] = Array.from(
        new Set([...(gatewayHosts[installation] ?? []), ...hosts]),
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
    installations: Array.from(installations),
    backends,
    sourceBackends,
    capabilities,
    backendCapabilities,
    loading,
    backendLoading,
    sharedHosts,
    gatewayHosts,
    unreachableInstallations: Array.from(unreachable).sort(),
    servedModels,
    gpuNodes: Array.from(gpuNodes.values()).filter(isAcceleratorCapacityRow),
    gpuCapacityUnavailable,
  };
}

/**
 * The LLMInferenceService a KServe workload Service hostname belongs to
 * (`<name>-kserve-workload-svc.<namespace>`, optionally `.svc` or
 * `.svc.cluster.local`), else `undefined`. The shape the llm-d controller
 * gives every workload Service, and what a ModelConfig's `baseUrl` names when
 * it points at one directly.
 */
export function servedObjectOfHostname(
  hostname: string | undefined,
): { name: string; namespace: string } | undefined {
  if (!hostname) {
    return undefined;
  }
  const match =
    /^(.+)-kserve-workload-svc\.([^.]+)(?:\.svc(?:\.cluster\.local)?)?$/.exec(
      hostname,
    );
  return match ? { name: match[1], namespace: match[2] } : undefined;
}

/**
 * The LLMInferenceService a route on the models Gateway belongs to: the
 * path's first two segments, `/<namespace>/<name>` — the platform's path
 * convention, `/v1` and the rest following — else `undefined`. Only
 * meaningful for a URL on a Gateway host: an external provider's path has
 * segments too, so callers narrow the host first.
 */
export function servedObjectOfRoute(
  url: string | undefined,
): { name: string; namespace: string } | undefined {
  if (!url) {
    return undefined;
  }
  try {
    const [namespace, name] = new URL(url).pathname.split('/').filter(Boolean);
    return namespace && name ? { namespace, name } : undefined;
  } catch {
    return undefined;
  }
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
  /** The backend's word for a non-ready state (`ServedModel.readinessReason`). */
  reason?: string;
  /**
   * Backend-native name of the model the client asks for: an Ollama tag, an
   * LLMInferenceService name.
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
  /** The installation's models Gateway authorities — `ServingSourceSnapshot.gatewayHosts`. */
  gatewayHosts: string[];
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
 * 3. Otherwise, an endpoint that names a KServe served object — a workload
 *    Service hostname ({@link servedObjectOfHostname}), or a route on the
 *    installation's models Gateway ({@link servedObjectOfRoute} on a
 *    `gatewayHosts` authority) — on an installation with a KServe backend is
 *    an LLMInferenceService that is stopped or was never created:
 *    `notServing`, named after the object.
 * 4. Anything else — a provider default, an external endpoint, a host nobody
 *    here knows — is not the serving layer's business: `undefined`.
 */
export function resolveClientServing(
  lookup: ServedModelLookup,
  context: ClientServingContext,
): ClientServingState | undefined {
  const { installation, candidates } = context;
  const served = findServedModel(lookup, candidates, {
    sharedHosts: context.sharedHosts,
  });
  if (served) {
    return {
      installation,
      backend: served.backend,
      readiness: served.readiness,
      reason: served.readinessReason,
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
    // multi-model one (a KServe model answers on its own Service, or on the
    // models Gateway under its own path — never on a host of this kind).
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

  const object =
    servedObjectOfHostname(hostname) ??
    (context.gatewayHosts.includes(authority)
      ? servedObjectOfRoute(lookup.endpoint)
      : undefined);
  if (object && context.backends.includes('kserve')) {
    return {
      installation,
      backend: 'kserve',
      readiness: 'notServing',
      name: object.name,
      namespace: object.namespace,
      message: `LLMInferenceService ${object.namespace}/${object.name} is not serving — stopped, or never created. Agents on this model config fail until it is served again.`,
    };
  }

  return undefined;
}

/**
 * The one-click fix a client's state admits, given what its installation can
 * do. `load` — bring a downloaded model into memory / create the
 * LLMInferenceService for it (model-manager's load, by the reference it lists
 * the model under); `pull` — fetch a model that is gone from a backend that
 * pulls by reference (the client's own `model`). `undefined` when nothing
 * applies: ready, still converging, failing with a message of its own, or a
 * backend without the capability — the Serving view is the fallback.
 *
 * `operatingBackend` is the installation's `backends` label — the backend of
 * the source that *acts* (a model-manager). A gone LLMInferenceService is
 * only offered its load when that source is KServe: on an installation whose
 * CRs are read next to an Ollama model-manager, the `load` flag is Ollama's
 * and would fail on an LLMInferenceService name.
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
    // A gone LLMInferenceService comes back through the backend's load of the
    // name it was served under (the preset, for one model-manager created) —
    // when the backend that loads is KServe's model-manager.
    return capabilities.load && operatingBackend === 'kserve'
      ? { kind: 'load', ref: state.name }
      : undefined;
  }
  return capabilities.pull ? { kind: 'pull', ref: state.name } : undefined;
}
