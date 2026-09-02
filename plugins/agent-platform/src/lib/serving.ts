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
 * - `ready` — answering requests.
 * - `notReady` — exists but not serving: rolling out, failed to load, or
 *   scaled to zero; `readinessMessage` says which.
 * - `pending` — no verdict yet ("not known", not "broken").
 */
export type ServedModelReadiness = 'ready' | 'notReady' | 'pending';

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
};

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
 * The served model a client base URL points at, among `candidates` (which the
 * caller has already narrowed to the client's installation). Matches on
 * hostname only, so scheme, port and the `/v1` path do not matter.
 *
 * `undefined` when the endpoint is empty (provider default), not a URL, or
 * fronts nothing known — e.g. an external provider, or a served model on
 * another installation.
 */
export function findServedModelForEndpoint(
  endpoint: string | undefined,
  candidates: ServedModel[],
): ServedModel | undefined {
  const hostname = urlHostname(endpoint);
  if (!hostname) {
    return undefined;
  }
  return candidates.find(model => model.endpointHosts.includes(hostname));
}

/** Merge per-source snapshots; later sources win for an installation both claim. */
export function mergeServingSnapshots(
  snapshots: ServingSourceSnapshot[],
): ServingSourceSnapshot {
  const backends: Record<string, ServingBackend> = {};
  const gpuCapacityUnavailable: Record<string, GpuCapacityUnavailableReason> =
    {};
  const unreachable = new Set<string>();
  for (const snapshot of snapshots) {
    Object.assign(backends, snapshot.backends);
    Object.assign(gpuCapacityUnavailable, snapshot.gpuCapacityUnavailable);
    snapshot.unreachableInstallations.forEach(name => unreachable.add(name));
  }
  return {
    isLoading: snapshots.some(snapshot => snapshot.isLoading),
    installations: Object.keys(backends),
    backends,
    unreachableInstallations: Array.from(unreachable).sort(),
    servedModels: snapshots.flatMap(snapshot => snapshot.servedModels),
    gpuNodes: snapshots.flatMap(snapshot => snapshot.gpuNodes),
    gpuCapacityUnavailable,
  };
}
