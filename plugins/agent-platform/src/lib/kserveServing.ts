// The KServe serving source's pure half: turning LLMInferenceService, Node and
// Pod objects (read with the user's RBAC) into the backend-agnostic shapes in
// `serving.ts`. The hook that fetches them is
// `components/ServingProvider/useKServeServingSource.ts`.

import {
  deriveLLMInferenceServiceReadiness,
  LLMInferenceService,
  Node,
  NVIDIA_GPU_RESOURCE,
  Pod,
  type LLMInferenceServiceInterface,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { AGENT_PLATFORM_PRESET_LABEL } from './modelServingConfig';
import {
  explanationWithoutReason,
  type GpuNode,
  type ServedModel,
} from './serving';

/** Poll cadence for LLMInferenceServices while any of them is still converging. */
export const LLMISVC_POLL_ACTIVE_MS = 10_000;
/** Poll cadence once every LLMInferenceService is ready — a model can still fail later. */
export const LLMISVC_POLL_IDLE_MS = 60_000;

/**
 * `refetchInterval` for the LLMInferenceService lists: readiness comes from
 * the object's status, written by the llm-d controller minutes after the
 * create — so the list has to be re-read to see a served model come up. Fast
 * while something is pending or failed, slow once everything answers.
 */
export function llmInferenceServiceRefetchInterval(query: {
  state: { data?: LLMInferenceServiceInterface[] };
}): number {
  const items = query.state.data ?? [];
  return items.some(
    item => deriveLLMInferenceServiceReadiness(item) !== 'ready',
  )
    ? LLMISVC_POLL_ACTIVE_MS
    : LLMISVC_POLL_IDLE_MS;
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
 * Extended resources device plugins advertise accelerators as, besides the
 * installation's own `gpuResourceName`: NVIDIA, AMD and Intel GPUs, Google
 * TPUs, Intel Gaudi. NPUs go by vendor (`<vendor>/npu`) and match by suffix.
 */
export const ACCELERATOR_RESOURCES: readonly string[] = [
  NVIDIA_GPU_RESOURCE,
  'amd.com/gpu',
  'intel.com/gpu',
  'google.com/tpu',
  'habana.ai/gaudi',
];

/**
 * The extended resource this node advertises its accelerators as, if any:
 * the installation's `gpuResourceName` (discovery ConfigMap) first, then the
 * known accelerator resources, then any `<vendor>/npu`. What
 * {@link toGpuNode} counts capacity, allocatable and requests in.
 */
export function acceleratorResourceOf(
  node: Node,
  gpuResourceName?: string,
): string | undefined {
  const capacity = node.getCapacity() ?? {};
  if (gpuResourceName && capacity[gpuResourceName] !== undefined) {
    return gpuResourceName;
  }
  return (
    ACCELERATOR_RESOURCES.find(resource => capacity[resource] !== undefined) ??
    Object.keys(capacity).find(key => key.endsWith('/npu'))
  );
}

/**
 * Whether a node carries accelerators by any evidence available: a device
 * plugin advertising an accelerator resource ({@link acceleratorResourceOf}),
 * or any gpu-feature-discovery label.
 */
export function isAcceleratorNode(
  node: Node,
  gpuResourceName?: string,
): boolean {
  const labels = node.getLabels() ?? {};
  return (
    acceleratorResourceOf(node, gpuResourceName) !== undefined ||
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
 * The workload pod that currently backs an LLMInferenceService: same
 * namespace, labelled with its name the way the llm-d controller labels the
 * pods it derives (`app.kubernetes.io/part-of=llminferenceservice`,
 * `app.kubernetes.io/name=<object>`), not finished. A Running pod wins over a
 * Pending one so a rollout shows where the model *is*, not where it is
 * heading.
 */
export function findWorkloadPod(
  object: LLMInferenceService,
  pods: Pod[],
): Pod | undefined {
  const { partOf, name } = LLMInferenceService.WORKLOAD_POD_LABELS;
  const candidates = pods.filter(
    pod =>
      pod.cluster === object.cluster &&
      pod.getNamespace() === object.getNamespace() &&
      pod.findLabel(partOf) === LLMInferenceService.WORKLOAD_POD_PART_OF &&
      pod.findLabel(name) === object.getName() &&
      !pod.isTerminal(),
  );
  return candidates.find(pod => pod.getPhase() === 'Running') ?? candidates[0];
}

/**
 * One LLMInferenceService as a backend-agnostic served model.
 *
 * The state is the object's conditions — unless it is being deleted
 * (`terminating`), or its workload pod waits for a node or an image, which
 * says more than the conditions do: the row is then `pending` with the pod's
 * reason (`Unschedulable`, `ImagePullBackOff`) and message. The same rule
 * model-manager applies, so the two sources agree on a folded row. A
 * non-ready condition's reason becomes `readinessReason` and leaves the
 * explanation, so the row does not say it twice.
 *
 * Named like model-manager names the same object: the model source is the
 * name the model is served under (`spec.model.name`, the Hugging Face
 * repository), the preset the label model-manager put on it. The accelerator
 * count is read under `gpuResourceName` — the installation's, from its
 * discovery config — else NVIDIA's.
 */
export function toServedModel(
  object: LLMInferenceService,
  pods: Pod[] = [],
  gpuResourceName?: string,
): ServedModel {
  const namespace = object.getNamespace();
  const labels = object.getLabels() ?? {};
  const pod = findWorkloadPod(object, pods);
  const podNode = pod?.getNodeName();
  const pinnedNode = object.getPinnedNode();

  let readiness: ServedModel['readiness'] = object.getReadiness();
  let readinessReason: string | undefined;
  let readinessMessage = object.getReadinessMessage();
  const waiting = pod?.getPendingState();
  if (object.getDeletionTimestamp()) {
    readiness = 'terminating';
    readinessMessage = `LLMInferenceService ${object.getName()} is being deleted.`;
  } else if (readiness !== 'ready' && waiting) {
    readiness = 'pending';
    readinessReason = waiting.reason;
    readinessMessage = waiting.message ?? readinessMessage;
  } else if (readiness !== 'ready') {
    readinessReason = object.getReadinessReason();
    readinessMessage = explanationWithoutReason(
      readinessMessage,
      readinessReason,
    );
  }

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
    id: `${object.cluster}/kserve/${namespace ?? ''}/${object.getName()}`,
    installation: object.cluster,
    backend: 'kserve',
    name: object.getName(),
    namespace,
    modelSource: object.getModelName() ?? object.getModelUri(),
    readiness,
    readinessMessage,
    readinessReason,
    node,
    nodeSource,
    gpuCount: object.getGpuRequest(gpuResourceName),
    internalUrl: object.getServedUrl(),
    externalUrl: object.getExternalUrl(),
    endpointHosts: object.getEndpointHosts(),
    preset: labels[AGENT_PLATFORM_PRESET_LABEL],
  };
}

/**
 * One node as a GPU-capacity row. `pods` — when given — are the pods bound to
 * this node (any namespace); their requests for the node's accelerator
 * resource ({@link acceleratorResourceOf}, `gpuResourceName` first) make up
 * `requested`. Leave the pods out when they could not (or need not) be read
 * and the row reports `requested: undefined`.
 */
export function toGpuNode(
  node: Node,
  pods?: Pod[],
  gpuResourceName?: string,
): GpuNode {
  const labels = node.getLabels() ?? {};
  const resource = acceleratorResourceOf(node, gpuResourceName);
  const counted = resource ?? NVIDIA_GPU_RESOURCE;
  const requested = pods
    ?.filter(pod => pod.getNodeName() === node.getName() && !pod.isTerminal())
    .reduce((total, pod) => total + (pod.getResourceRequest(counted) ?? 0), 0);

  return {
    id: `${node.cluster}/${node.getName()}`,
    installation: node.cluster,
    name: node.getName(),
    ready: node.isReady(),
    product: labels[GPU_FEATURE_DISCOVERY_LABELS.product],
    memoryMiB: parseLabelInteger(labels[GPU_FEATURE_DISCOVERY_LABELS.memory]),
    labeledCount: parseLabelInteger(labels[GPU_FEATURE_DISCOVERY_LABELS.count]),
    resource,
    capacity: node.getCapacityOf(counted),
    allocatable: node.getAllocatableOf(counted),
    requested,
    memoryAllocatableBytes: node.getAllocatableMemoryBytes(),
    schedulable: node.isSchedulable(),
  };
}
