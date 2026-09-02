// The backend-agnostic shape of "a model being served" for the Models tab's
// Serving section, and the pure helpers over it.
//
// This is the seam between the UI and wherever the serving data comes from. A
// *serving source* (see `components/ServingProvider`) turns one backend's own
// objects into these types: today the KServe source reads InferenceService,
// Node and Pod resources with the user's RBAC (`lib/kserveServing.ts`); a
// model-manager source (Ollama or KServe behind the model-manager API, with
// capability flags) plugs in beside it without the table, panel or linking
// code changing. Keep backend specifics out of here.

import { urlHostname } from '@giantswarm/backstage-plugin-kubernetes-react';

/**
 * Serving backends a source can report. `kserve` — InferenceServices read as
 * CRs; `ollama` — the model-manager's host-Ollama backend (arrives with the
 * model-manager source; listed here so the union is settled).
 */
export type ServingBackend = 'kserve' | 'ollama';

/**
 * Readiness of a served model, backend-neutral.
 *
 * - `ready` — answering requests (loaded, serving).
 * - `available` — present on the backend but not running right now: a
 *   downloaded model that is not loaded into memory. Not a fault; a backend
 *   with `load` brings it to `ready`, and one that loads on demand (Ollama)
 *   answers requests to it anyway.
 * - `notReady` — exists but not serving: rolling out, failed to load, or
 *   scaled to zero; `readinessMessage` says which.
 * - `pending` — no verdict yet ("not known", not "broken").
 */
export type ServedModelReadiness =
  'ready' | 'available' | 'notReady' | 'pending';

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
   * The kagent ModelConfig the serving backend itself created for this model
   * (model-manager's auto-wiring), with the controller's verdict on it. Exact
   * — no endpoint matching involved — so it links even when the user cannot
   * list ModelConfigs. Absent when the backend created none, or does not say.
   */
  modelConfig?: {
    name: string;
    namespace: string;
    ready?: boolean;
    message?: string;
  };
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
   * What the source can do per installation in `installations`. Optional:
   * a source that omits it offers nothing beyond listing there.
   */
  capabilities?: Record<string, ServingCapabilities>;
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
 * Merge per-source snapshots. Later sources win the `backends` label for an
 * installation both claim; served models and GPU nodes are concatenated (a
 * KServe InferenceService and an Ollama model on the same installation both
 * render); capabilities are OR-ed per flag, so an installation offers what any
 * of its sources can do — the CR source's GPU panel next to the
 * model-manager's pull and load.
 */
export function mergeServingSnapshots(
  snapshots: ServingSourceSnapshot[],
): ServingSourceSnapshot {
  const backends: Record<string, ServingBackend> = {};
  const capabilities: Record<string, ServingCapabilities> = {};
  const gpuCapacityUnavailable: Record<string, GpuCapacityUnavailableReason> =
    {};
  const unreachable = new Set<string>();
  for (const snapshot of snapshots) {
    Object.assign(backends, snapshot.backends);
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
  }
  return {
    isLoading: snapshots.some(snapshot => snapshot.isLoading),
    installations: Object.keys(backends),
    backends,
    capabilities,
    unreachableInstallations: Array.from(unreachable).sort(),
    servedModels: snapshots.flatMap(snapshot => snapshot.servedModels),
    gpuNodes: snapshots.flatMap(snapshot => snapshot.gpuNodes),
    gpuCapacityUnavailable,
  };
}
