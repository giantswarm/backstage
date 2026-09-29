import { useMemo } from 'react';
import {
  isNotFoundError,
  LLMInferenceService,
  Node,
  useResources,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useModelServingConfigs } from '../../hooks/useModelServingConfigs';
import { usePodLists, type PodListRequest } from '../../hooks/usePodLists';
import {
  acceleratorResourceOf,
  isAcceleratorNode,
  llmInferenceServiceRefetchInterval,
  toGpuNode,
  toServedModel,
} from '../../lib/kserveServing';
import {
  endpointAuthority,
  NO_SERVING_CAPABILITIES,
  type GpuCapacityUnavailableReason,
  type ServingCapabilities,
  type ServingSourceSnapshot,
} from '../../lib/serving';

/**
 * What reading the objects can offer: the node inventory (the GPU capacity
 * panel) and nothing operational — pull, load, delete and wiring need a
 * service that talks to the serving backend (the model-manager source).
 */
export const KSERVE_CR_CAPABILITIES: ServingCapabilities = {
  ...NO_SERVING_CAPABILITIES,
  nodeInventory: true,
};

/**
 * Which installations the KServe source reads: what the gs installation
 * inventory (`useInstallationInventory`, one `GET /apis` per installation) says
 * about the `serving.kserve.io` API group, handed in by the ServingProvider.
 */
export type KServeInstallations = {
  /**
   * Installations whose API groups include `serving.kserve.io` and whose
   * access is healthy, home first.
   */
  installations: string[];
  /** The inventory has not answered yet for some installation that still can. */
  isProbing: boolean;
  /** Installations whose inventory probe failed: they could not be asked. */
  errors: { installation: string; error: Error }[];
};

/**
 * The KServe serving source: LLMInferenceServices, nodes and pods read as
 * Kubernetes resources with the user's own RBAC, on the installations whose
 * inventory has the `serving.kserve.io` API group.
 *
 * Reads, per installation with KServe (nothing at all is read elsewhere):
 * 1. the LLMInferenceServices (all namespaces);
 * 2. the nodes, for GPU labels and device-plugin capacity — kept when they
 *    carry an accelerator ({@link isAcceleratorNode}), by the resource name
 *    the installation's discovery ConfigMap declares (`gpuResourceName`,
 *    read as well) or a known accelerator resource;
 * 3. the workload pods (one list by the llm-d controller's label), for where
 *    each model actually runs;
 * 4. per GPU node with schedulable GPUs, the pods bound to it (a field-selector
 *    list), for "free = allocatable − requested".
 *
 * The discovery ConfigMap also names the installation's models Gateway, on
 * which every routed model answers under `/<namespace>/<name>`: published as
 * the installation's `gatewayHosts`, so a client on it is resolved by its path.
 *
 * Every read degrades on its own: no permission to list nodes hides capacity
 * for that installation but not the served models; a node without device-plugin
 * data shows its labels and an unknown allocatable; unreadable pods leave
 * `requested` (and thus free) unknown.
 */
export function useKServeServingSource(
  kserve: KServeInstallations,
): ServingSourceSnapshot {
  const { installations, isProbing, errors: probeErrors } = kserve;
  const installationsKey = installations.join(',');

  // Single LLMInferenceService version (v1alpha2, the storage version the
  // llm-d control plane serves), so skip API version discovery — the
  // inventory already established the group is served. Polled: a model's
  // readiness is written into the object by the controller minutes after it
  // is created.
  const objects = useResources(
    installations,
    LLMInferenceService,
    {},
    {
      enableDiscovery: false,
      refetchInterval: llmInferenceServiceRefetchInterval,
    },
  );
  const nodes = useResources(
    installations,
    Node,
    {},
    { enableDiscovery: false },
  );

  // The installation's serving contract, for the resource name its
  // accelerators go by (`gpuResourceName`) and its models Gateway; the known
  // accelerator resources and the discovery labels still count on an
  // installation without one.
  const servingConfigs = useModelServingConfigs(installations);
  const gpuResourceNames = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(servingConfigs.configs).map(([installation, config]) => [
          installation,
          config.gpuResourceName,
        ]),
      ) as Record<string, string | undefined>,
    [servingConfigs.configs],
  );
  const gatewayHosts = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(servingConfigs.configs).flatMap(
          ([installation, config]) => {
            const authority = endpointAuthority(config.gateway?.endpoint);
            return authority ? [[installation, [authority]]] : [];
          },
        ),
      ) as Record<string, string[]>,
    [servingConfigs.configs],
  );

  const gpuNodes = useMemo(
    () =>
      nodes.resources.filter(node =>
        isAcceleratorNode(node, gpuResourceNames[node.cluster]),
      ),
    [nodes.resources, gpuResourceNames],
  );

  const podRequests = useMemo<PodListRequest[]>(
    () => [
      ...installations.map(installation => ({
        installation,
        labelSelector: LLMInferenceService.WORKLOAD_POD_SELECTOR,
      })),
      // Only nodes with schedulable accelerators: without an allocatable
      // figure there is nothing to subtract pod requests from.
      ...gpuNodes
        .filter(node => {
          const resource = acceleratorResourceOf(
            node,
            gpuResourceNames[node.cluster],
          );
          return resource !== undefined
            ? (node.getAllocatableOf(resource) ?? 0) > 0
            : false;
        })
        .map(node => ({
          installation: node.cluster,
          fieldSelector: `spec.nodeName=${node.getName()}`,
        })),
    ],
    // `installations` is a fresh array each render; key on its contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [installationsKey, gpuNodes, gpuResourceNames],
  );
  const podLists = usePodLists(podRequests);

  return useMemo<ServingSourceSnapshot>(() => {
    const workloadPods = podLists.results
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

    const servedModels = objects.resources.map(object =>
      toServedModel(object, workloadPods, gpuResourceNames[object.cluster]),
    );

    const gpuNodeRows = gpuNodes.map(node =>
      toGpuNode(
        node,
        nodePods.get(`${node.cluster}/spec.nodeName=${node.getName()}`),
        gpuResourceNames[node.cluster],
      ),
    );

    // A 404 on the LLMInferenceService list after a positive inventory means
    // the CRD has gone since the (cached, hour-long) probe answered — the
    // llm-d control plane was uninstalled. Drop the installation right away
    // rather than showing an empty Serving view until the inventory is read
    // again.
    const crdGone = new Set(
      objects.errors.filter(isNotFoundError).map(e => e.cluster),
    );
    const activeInstallations = installations.filter(
      installation => !crdGone.has(installation),
    );

    // An installation counts as unreadable when the inventory probe itself
    // failed, or the LLMInferenceService list did (403, unreachable) and
    // produced nothing — same classification as ModelConfigsProvider.
    const withModels = new Set(servedModels.map(model => model.installation));
    const unreachable = new Set<string>(
      probeErrors.map(({ installation }) => installation),
    );
    for (const error of objects.errors) {
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
        isProbing || objects.isLoading || nodes.isLoading || podLists.isLoading,
      installations: activeInstallations,
      backends: Object.fromEntries(
        activeInstallations.map(installation => [
          installation,
          'kserve' as const,
        ]),
      ),
      capabilities: Object.fromEntries(
        activeInstallations.map(installation => [
          installation,
          KSERVE_CR_CAPABILITIES,
        ]),
      ),
      gatewayHosts: Object.fromEntries(
        activeInstallations
          .filter(installation => gatewayHosts[installation])
          .map(installation => [installation, gatewayHosts[installation]]),
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
    objects.resources,
    objects.errors,
    objects.isLoading,
    nodes.errors,
    nodes.isLoading,
    gpuNodes,
    gpuResourceNames,
    gatewayHosts,
    podLists.results,
    podLists.isLoading,
  ]);
}
