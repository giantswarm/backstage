import { useMemo } from 'react';
import {
  InferenceService,
  isNotFoundError,
  Node,
  NVIDIA_GPU_RESOURCE,
  useResources,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useKServeInstallations } from '../../hooks/useKServeInstallations';
import { usePodLists, type PodListRequest } from '../../hooks/usePodLists';
import {
  inferenceServiceRefetchInterval,
  isGpuNode,
  KSERVE_INFERENCESERVICE_LABEL,
  toGpuNode,
  toServedModel,
} from '../../lib/kserveServing';
import type {
  GpuCapacityUnavailableReason,
  ServingSourceSnapshot,
} from '../../lib/serving';

/**
 * The KServe serving source: InferenceServices, nodes and pods read as
 * Kubernetes resources with the user's own RBAC, on the installations that
 * serve the InferenceService CRD.
 *
 * Reads, per installation with KServe (nothing at all is read elsewhere):
 * 1. the InferenceServices (all namespaces);
 * 2. the nodes, for GPU labels and device-plugin capacity;
 * 3. the predictor pods (one list by KServe's label), for where each model
 *    actually runs;
 * 4. per GPU node with schedulable GPUs, the pods bound to it (a field-selector
 *    list), for "free = allocatable − requested".
 *
 * Every read degrades on its own: no permission to list nodes hides capacity
 * for that installation but not the served models; a node without device-plugin
 * data shows its labels and an unknown allocatable; unreadable pods leave
 * `requested` (and thus free) unknown.
 */
export function useKServeServingSource(
  reachableInstallations: string[],
): ServingSourceSnapshot {
  const {
    installations,
    isProbing,
    errors: probeErrors,
  } = useKServeInstallations(reachableInstallations);
  const installationsKey = installations.join(',');

  // Single InferenceService version (v1beta1), so skip API version discovery —
  // the probe already established the group/version is served. Polled: a
  // model's readiness is written into the CR by the controller minutes after
  // it is created, and the auto-wiring acts on it.
  const inferenceServices = useResources(
    installations,
    InferenceService,
    {},
    {
      enableDiscovery: false,
      refetchInterval: inferenceServiceRefetchInterval,
    },
  );
  const nodes = useResources(
    installations,
    Node,
    {},
    { enableDiscovery: false },
  );

  const gpuNodes = useMemo(
    () => nodes.resources.filter(isGpuNode),
    [nodes.resources],
  );

  const podRequests = useMemo<PodListRequest[]>(
    () => [
      ...installations.map(installation => ({
        installation,
        labelSelector: KSERVE_INFERENCESERVICE_LABEL,
      })),
      // Only nodes with schedulable GPUs: without an allocatable figure there
      // is nothing to subtract pod requests from.
      ...gpuNodes
        .filter(node => (node.getAllocatableOf(NVIDIA_GPU_RESOURCE) ?? 0) > 0)
        .map(node => ({
          installation: node.cluster,
          fieldSelector: `spec.nodeName=${node.getName()}`,
        })),
    ],
    // `installations` is a fresh array each render; key on its contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [installationsKey, gpuNodes],
  );
  const podLists = usePodLists(podRequests);

  return useMemo<ServingSourceSnapshot>(() => {
    const predictorPods = podLists.results
      .filter(result => result.request.labelSelector)
      .flatMap(result => result.pods ?? []);

    const nodePods = new Map(
      podLists.results
        .filter(result => result.request.fieldSelector)
        .map(result => [
          `${result.request.installation}/${result.request.fieldSelector}`,
          result.pods,
        ]),
    );

    const servedModels = inferenceServices.resources.map(inferenceService =>
      toServedModel(inferenceService, predictorPods),
    );

    const gpuNodeRows = gpuNodes.map(node =>
      toGpuNode(
        node,
        nodePods.get(`${node.cluster}/spec.nodeName=${node.getName()}`),
      ),
    );

    // A 404 on the InferenceService list after a positive probe means the CRD
    // has gone since the (cached) probe answered — KServe was uninstalled. Drop
    // the installation right away rather than showing an empty Serving section
    // until the probe's cache expires.
    const crdGone = new Set(
      inferenceServices.errors.filter(isNotFoundError).map(e => e.cluster),
    );
    const activeInstallations = installations.filter(
      installation => !crdGone.has(installation),
    );

    // An installation counts as unreadable when the probe itself failed, or the
    // InferenceService list did (403, unreachable) and produced nothing — same
    // classification as ModelConfigsProvider.
    const withModels = new Set(servedModels.map(model => model.installation));
    const unreachable = new Set<string>(
      probeErrors.map(({ installation }) => installation),
    );
    for (const error of inferenceServices.errors) {
      if (!isNotFoundError(error) && !withModels.has(error.cluster)) {
        unreachable.add(error.cluster);
      }
    }

    const gpuCapacityUnavailable: Record<string, GpuCapacityUnavailableReason> =
      {};
    for (const error of nodes.errors) {
      if (error.type === 'incompatibility') {
        continue;
      }
      gpuCapacityUnavailable[error.cluster] =
        error.error.name === 'ForbiddenError' ? 'forbidden' : 'error';
    }

    return {
      isLoading:
        isProbing ||
        inferenceServices.isLoading ||
        nodes.isLoading ||
        podLists.isLoading,
      installations: activeInstallations,
      backends: Object.fromEntries(
        activeInstallations.map(installation => [
          installation,
          'kserve' as const,
        ]),
      ),
      unreachableInstallations: Array.from(unreachable).sort(),
      servedModels,
      gpuNodes: gpuNodeRows.filter(node => !crdGone.has(node.installation)),
      gpuCapacityUnavailable,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    installationsKey,
    isProbing,
    probeErrors,
    inferenceServices.resources,
    inferenceServices.errors,
    inferenceServices.isLoading,
    nodes.errors,
    nodes.isLoading,
    gpuNodes,
    podLists.results,
    podLists.isLoading,
  ]);
}
