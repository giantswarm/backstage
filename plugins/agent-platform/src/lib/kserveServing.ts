// The KServe serving source's pure half: turning InferenceService, Node and
// Pod objects (read with the user's RBAC) into the backend-agnostic shapes in
// `serving.ts`. The hook that fetches them is
// `components/ServingProvider/useKServeServingSource.ts`.

import {
  BACKSTAGE_FIELD_MANAGER,
  deriveInferenceServiceReadiness,
  InferenceService,
  Node,
  NVIDIA_GPU_RESOURCE,
  Pod,
  type InferenceServiceInterface,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import type { GpuNode, ServedModel } from './serving';
import { AGENT_PLATFORM_PRESET_LABEL } from './servingPresets';

/**
 * Label KServe puts on every predictor pod, valued with the InferenceService
 * name. Listing pods by this label (all namespaces) yields the fleet's
 * predictor pods in one request per installation.
 */
export const KSERVE_INFERENCESERVICE_LABEL =
  'serving.kserve.io/inferenceservice';

/** Marks the objects this portal writes (same value as its field manager). */
export const MANAGED_BY_LABEL = 'app.kubernetes.io/managed-by';

/**
 * Annotation the serve flow puts on an InferenceService it creates: the kagent
 * ModelConfig (`<namespace>/<name>`) to create once the model is ready. The
 * auto-wiring reads it back, so the promise survives a page reload and is kept
 * by whichever session sees the model ready first.
 */
export const MODEL_CONFIG_ANNOTATION =
  'agent-platform.giantswarm.io/model-config';

/** Friendly name, the same annotation `ModelConfig.getDisplayName()` reads. */
export const DISPLAY_NAME_ANNOTATION = 'ui.giantswarm.io/display-name';

/** `<namespace>/<name>` → its parts; `undefined` for anything else. */
export function parseModelConfigRef(
  value: string | undefined,
): { namespace: string; name: string } | undefined {
  const match = value ? /^([^/\s]+)\/([^/\s]+)$/.exec(value) : null;
  return match ? { namespace: match[1], name: match[2] } : undefined;
}

/** Poll cadence for InferenceServices while any of them is still converging. */
export const INFERENCESERVICE_POLL_ACTIVE_MS = 10_000;
/** Poll cadence once every InferenceService is ready — a model can still fail later. */
export const INFERENCESERVICE_POLL_IDLE_MS = 60_000;

/**
 * `refetchInterval` for the InferenceService lists: readiness comes from the
 * CR's status, written by the KServe controller minutes after the create — so
 * the list has to be re-read to see a served model come up (and to complete its
 * auto-wiring). Fast while something is pending or failed, slow once everything
 * answers.
 */
export function inferenceServiceRefetchInterval(query: {
  state: { data?: InferenceServiceInterface[] };
}): number {
  const items = query.state.data ?? [];
  return items.some(item => deriveInferenceServiceReadiness(item) !== 'ready')
    ? INFERENCESERVICE_POLL_ACTIVE_MS
    : INFERENCESERVICE_POLL_IDLE_MS;
}

/**
 * Node labels written by NVIDIA gpu-feature-discovery. Present wherever the
 * GPU operator (or GFD alone) runs — independent of the device plugin, which
 * is what fills `status.allocatable['nvidia.com/gpu']`.
 */
export const GPU_FEATURE_DISCOVERY_LABELS = {
  present: 'nvidia.com/gpu.present',
  product: 'nvidia.com/gpu.product',
  /** MiB per GPU. */
  memory: 'nvidia.com/gpu.memory',
  count: 'nvidia.com/gpu.count',
} as const;

/**
 * Whether a node carries GPUs by any evidence available: device-plugin
 * capacity, or any gpu-feature-discovery label.
 */
export function isGpuNode(node: Node): boolean {
  const labels = node.getLabels() ?? {};
  return (
    node.getCapacityOf(NVIDIA_GPU_RESOURCE) !== undefined ||
    labels[GPU_FEATURE_DISCOVERY_LABELS.present] === 'true' ||
    GPU_FEATURE_DISCOVERY_LABELS.product in labels ||
    GPU_FEATURE_DISCOVERY_LABELS.count in labels
  );
}

function parseLabelInteger(value: string | undefined): number | undefined {
  return value !== undefined && /^\d+$/.test(value)
    ? Number.parseInt(value, 10)
    : undefined;
}

/**
 * The predictor pod that currently backs an InferenceService: same namespace,
 * labelled with its name, not finished. A Running pod wins over a Pending one
 * so a rollout shows where the model *is*, not where it is heading.
 */
export function findPredictorPod(
  inferenceService: InferenceService,
  pods: Pod[],
): Pod | undefined {
  const candidates = pods.filter(
    pod =>
      pod.cluster === inferenceService.cluster &&
      pod.getNamespace() === inferenceService.getNamespace() &&
      pod.findLabel(KSERVE_INFERENCESERVICE_LABEL) ===
        inferenceService.getName() &&
      !pod.isTerminal(),
  );
  return candidates.find(pod => pod.getPhase() === 'Running') ?? candidates[0];
}

/** One InferenceService as a backend-agnostic served model. */
export function toServedModel(
  inferenceService: InferenceService,
  pods: Pod[] = [],
): ServedModel {
  const namespace = inferenceService.getNamespace();
  const labels = inferenceService.getLabels() ?? {};
  const annotations = inferenceService.getAnnotations() ?? {};
  const pod = findPredictorPod(inferenceService, pods);
  const podNode = pod?.getNodeName();
  const pinnedNode = inferenceService.getPinnedNode();

  let node: string | undefined;
  let nodeSource: ServedModel['nodeSource'];
  if (podNode) {
    node = podNode;
    nodeSource = 'pod';
  } else if (pinnedNode) {
    node = pinnedNode;
    nodeSource = 'spec';
  }

  return {
    id: `${inferenceService.cluster}/kserve/${namespace ?? ''}/${inferenceService.getName()}`,
    installation: inferenceService.cluster,
    backend: 'kserve',
    name: inferenceService.getName(),
    namespace,
    modelSource: inferenceService.getStorageUri(),
    runtime: inferenceService.getRuntime() ?? inferenceService.getModelFormat(),
    readiness: inferenceService.getReadiness(),
    readinessMessage: inferenceService.getReadinessMessage(),
    node,
    nodeSource,
    gpuCount: inferenceService.getGpuRequest(),
    internalUrl: inferenceService.getInternalUrl(),
    externalUrl: inferenceService.getUrl(),
    endpointHosts: inferenceService.getEndpointHosts(),
    displayName: annotations[DISPLAY_NAME_ANNOTATION],
    preset: labels[AGENT_PLATFORM_PRESET_LABEL],
    managedByPortal: labels[MANAGED_BY_LABEL] === BACKSTAGE_FIELD_MANAGER,
    autoWire: parseModelConfigRef(annotations[MODEL_CONFIG_ANNOTATION]),
  };
}

/**
 * One node as a GPU-capacity row. `pods` — when given — are the pods bound to
 * this node (any namespace); their `nvidia.com/gpu` requests make up
 * `requested`. Leave it out when pods could not (or need not) be read and the
 * row reports `requested: undefined`.
 */
export function toGpuNode(node: Node, pods?: Pod[]): GpuNode {
  const labels = node.getLabels() ?? {};
  const requested = pods
    ?.filter(pod => pod.getNodeName() === node.getName() && !pod.isTerminal())
    .reduce(
      (total, pod) =>
        total + (pod.getResourceRequest(NVIDIA_GPU_RESOURCE) ?? 0),
      0,
    );

  return {
    id: `${node.cluster}/${node.getName()}`,
    installation: node.cluster,
    name: node.getName(),
    ready: node.isReady(),
    product: labels[GPU_FEATURE_DISCOVERY_LABELS.product],
    memoryMiB: parseLabelInteger(labels[GPU_FEATURE_DISCOVERY_LABELS.memory]),
    labeledCount: parseLabelInteger(labels[GPU_FEATURE_DISCOVERY_LABELS.count]),
    capacity: node.getCapacityOf(NVIDIA_GPU_RESOURCE),
    allocatable: node.getAllocatableOf(NVIDIA_GPU_RESOURCE),
    requested,
    memoryAllocatableBytes: node.getAllocatableMemoryBytes(),
    schedulable: node.isSchedulable(),
  };
}
