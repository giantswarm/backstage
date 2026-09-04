import { useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { useQueries } from '@tanstack/react-query';
import { modelManagerApiRef } from '../../apis';
import { useModelManagerInstallations } from '../../hooks/useModelManagerInstallations';
import type {
  ModelManagerBackend,
  ModelManagerModel,
  ModelManagerNode,
} from '../../lib/modelManager';
import {
  sharedHostsOf,
  toGpuNodeFromManager,
  toServedModelFromManager,
  toServingBackend,
  toServingCapabilities,
  toServingLoading,
} from '../../lib/modelManagerServing';
import {
  modelManagerBackendQueryKey,
  modelManagerModelsQueryKey,
  modelManagerNodesQueryKey,
} from '../../lib/queryKeys';
import {
  NO_SERVING_CAPABILITIES,
  type GpuCapacityUnavailableReason,
  type ServingBackend,
  type ServingCapabilities,
  type ServingLoading,
  type ServingSourceSnapshot,
} from '../../lib/serving';

/**
 * The backend descriptors change when model-manager is reconfigured, and
 * their `healthy` flags when a host backend goes away — so re-read them now
 * and then, but not on every render.
 */
export const BACKEND_REFETCH_MS = 60_000;

/**
 * The inventory changes under the portal's feet: a `keep_alive` expiring
 * unloads a model, a pull started from an agent (MCP) adds one. Poll while the
 * section is visible; mutations invalidate on top.
 */
export const MODELS_REFETCH_MS = 30_000;

/**
 * The node view (memory budgets, what served models reserve, the cache
 * contents) moves with the inventory; model-manager itself reuses a cache scan
 * for a couple of minutes, so polling faster buys nothing.
 */
export const NODES_REFETCH_MS = 60_000;

/** A backend descriptor whose backend name the portal has a vocabulary for. */
export type KnownBackend = ModelManagerBackend & { backend: ServingBackend };

/**
 * The backends model-manager runs per installation, in model-manager's order
 * — the first is its default backend. One entry on a model-manager before
 * 0.17, several where one process fronts an Ollama and a Lemonade Server.
 */
type BackendsByInstallation = Record<string, KnownBackend[]>;

/**
 * The descriptor a model, node or job of an installation belongs to: the one
 * named by its `backend` (model-manager 0.17 on), else the installation's
 * default — the only one a model-manager before 0.17 has.
 */
export function descriptorFor(
  descriptors: KnownBackend[],
  backend: string | undefined,
): KnownBackend | undefined {
  if (backend) {
    const named = descriptors.find(
      descriptor => descriptor.backend === backend,
    );
    if (named) {
      return named;
    }
  }
  return descriptors[0];
}

/**
 * The model-manager serving source: the inventory of the installations the
 * backend proxies a model-manager for, read through the model-manager REST
 * API with the user's own installation token.
 *
 * Per installation with a model-manager (nothing at all is read elsewhere):
 * 1. `GET /api/v1/backends` — every backend the installation's model-manager
 *    runs (Ollama, KServe, Lemonade — one, or several at once since
 *    model-manager 0.17), whether each is healthy, and the capability flags
 *    that decide which controls render for its rows; on an older
 *    model-manager the one descriptor of `GET /api/v1/backend`;
 * 2. `GET /api/v1/models` — the downloaded models of every backend, each
 *    naming its backend and already carrying its loaded state, memory
 *    footprint and the ModelConfig model-manager created for it.
 *    (`/api/v1/loaded` says nothing more, so it is not read here.)
 *
 * Degradation: an installation whose descriptors or inventory cannot be read
 * (the gateway rejected the token, model-manager is down, the user is not
 * signed in there) is surfaced as unreachable — never dropped silently, since
 * the operator configured a model-manager there. A backend of a name this
 * portal has no vocabulary for is skipped with a console warning; a backend
 * whose host server is down is listed unhealthy (its rows say so), and the
 * inventory of the others still renders — model-manager reports such a
 * backend under `errors` rather than failing the read.
 *
 * Contributes GPU nodes where a backend reports `nodeInventory`: `GET
 * /api/v1/nodes` — each node's memory budget for fit checks, what the models
 * served there reserve of it, and the download cache on it; a backend host
 * (Ollama, Lemonade) is one row per backend. On an installation whose
 * InferenceServices are also read as CRs the provider lays these rows over
 * the CR source's (device-plugin capacity, pod requests), so the GPU panel
 * has one row per node.
 */
export function useModelManagerServingSource(
  reachableInstallations: string[],
): ServingSourceSnapshot {
  const modelManagerApi = useApi(modelManagerApiRef);
  const { installations, isLoading: isListing } = useModelManagerInstallations(
    reachableInstallations,
  );
  const installationsKey = installations.join(',');

  const backendQueries = useQueries({
    queries: installations.map(installation => ({
      queryKey: modelManagerBackendQueryKey(installation),
      queryFn: () => modelManagerApi.listBackends(installation),
      staleTime: BACKEND_REFETCH_MS,
      refetchInterval: BACKEND_REFETCH_MS,
    })),
  });

  // useQueries hands back fresh arrays every render, so the memos below key on
  // signatures of what matters — status and the time data last changed — and
  // read the query results through the closure. Same approach as
  // useKagentCapabilitiesMap.
  const backendSignature = backendQueries
    .map(query => `${query.status}:${query.dataUpdatedAt}`)
    .join('|');

  const backends = useMemo<BackendsByInstallation>(() => {
    const result: BackendsByInstallation = {};
    installations.forEach((installation, index) => {
      const descriptors = backendQueries[index]?.data;
      if (!descriptors) {
        return;
      }
      const known: KnownBackend[] = [];
      for (const descriptor of descriptors) {
        const backend = toServingBackend(descriptor.backend);
        if (!backend) {
          // eslint-disable-next-line no-console
          console.warn(
            `[agent-platform] model-manager on ${installation} reports backend '${descriptor.backend}', which this portal does not know; skipping it.`,
          );
          continue;
        }
        known.push({ ...descriptor, backend });
      }
      if (known.length > 0) {
        result[installation] = known;
      }
    });
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installationsKey, backendSignature]);

  const modelQueries = useQueries({
    queries: installations.map(installation => ({
      queryKey: modelManagerModelsQueryKey(installation),
      queryFn: () => modelManagerApi.listModels(installation),
      // Only once the backends answered: without a descriptor there is no
      // vocabulary to render the models in, and a failing descriptor read
      // already marks the installation unreachable.
      enabled: Boolean(backends[installation]),
      staleTime: 10_000,
      refetchInterval: MODELS_REFETCH_MS,
    })),
  });

  const modelsSignature = modelQueries
    .map(query => `${query.status}:${query.isLoading}:${query.dataUpdatedAt}`)
    .join('|');

  const nodeQueries = useQueries({
    queries: installations.map(installation => ({
      queryKey: modelManagerNodesQueryKey(installation),
      queryFn: () => modelManagerApi.listNodes(installation),
      // Only where a backend has a node inventory; asking one without it
      // answers 403.
      enabled: Boolean(
        backends[installation]?.some(
          descriptor => descriptor.capabilities.nodeInventory,
        ),
      ),
      staleTime: 30_000,
      refetchInterval: NODES_REFETCH_MS,
    })),
  });

  const nodesSignature = nodeQueries
    .map(query => `${query.status}:${query.isLoading}:${query.dataUpdatedAt}`)
    .join('|');

  return useMemo<ServingSourceSnapshot>(() => {
    const active: string[] = [];
    const backendByInstallation: Record<string, ServingBackend> = {};
    const sourceBackends: Record<string, ServingBackend[]> = {};
    const capabilities: Record<string, ServingCapabilities> = {};
    const backendCapabilities: NonNullable<
      ServingSourceSnapshot['backendCapabilities']
    > = {};
    const loading: Record<string, ServingLoading> = {};
    const backendLoading: NonNullable<ServingSourceSnapshot['backendLoading']> =
      {};
    const sharedHosts: Record<string, string[]> = {};
    const unreachable = new Set<string>();
    const servedModels: ServingSourceSnapshot['servedModels'] = [];
    const gpuNodes: ServingSourceSnapshot['gpuNodes'] = [];
    const gpuCapacityUnavailable: Record<string, GpuCapacityUnavailableReason> =
      {};

    installations.forEach((installation, index) => {
      const backendQuery = backendQueries[index];
      const modelQuery = modelQueries[index];
      const nodeQuery = nodeQueries[index];
      const descriptors = backends[installation];

      if (backendQuery?.isError) {
        unreachable.add(installation);
        return;
      }
      if (!descriptors) {
        // Still loading, or only unknown backends (already warned about).
        return;
      }

      active.push(installation);
      // The installation's label is its default backend; every backend has
      // a say, its own flags and its own loading semantics.
      backendByInstallation[installation] = descriptors[0].backend;
      sourceBackends[installation] = descriptors.map(
        descriptor => descriptor.backend,
      );
      const merged = { ...NO_SERVING_CAPABILITIES };
      const perBackendCapabilities: Partial<
        Record<ServingBackend, ServingCapabilities>
      > = {};
      const perBackendLoading: Partial<Record<ServingBackend, ServingLoading>> =
        {};
      for (const descriptor of descriptors) {
        const flags = toServingCapabilities(descriptor.capabilities);
        perBackendCapabilities[descriptor.backend] = flags;
        for (const key of Object.keys(flags) as (keyof ServingCapabilities)[]) {
          merged[key] = merged[key] || flags[key];
        }
        const loadingSemantics = toServingLoading(descriptor.loading);
        if (loadingSemantics) {
          perBackendLoading[descriptor.backend] = loadingSemantics;
        }
      }
      capabilities[installation] = merged;
      backendCapabilities[installation] = perBackendCapabilities;
      const defaultLoading = perBackendLoading[descriptors[0].backend];
      if (defaultLoading) {
        loading[installation] = defaultLoading;
      }
      if (Object.keys(perBackendLoading).length > 0) {
        backendLoading[installation] = perBackendLoading;
      }

      if (modelQuery?.isError) {
        // The backends are known but the inventory is not readable (the
        // gateway rejecting this call): the section still shows the
        // installation, and says it could not be read.
        unreachable.add(installation);
        return;
      }
      for (const model of (modelQuery?.data ?? []) as ModelManagerModel[]) {
        const descriptor = descriptorFor(descriptors, model.backend);
        if (!descriptor) {
          continue;
        }
        servedModels.push(
          toServedModelFromManager(installation, descriptor, model),
        );
      }
      // Only once the inventory has been read: a client of the host whose
      // model is merely not listed *yet* must not read as "gone".
      if (modelQuery?.data) {
        const hosts = Array.from(
          new Set(descriptors.flatMap(descriptor => sharedHostsOf(descriptor))),
        );
        if (hosts.length > 0) {
          sharedHosts[installation] = hosts;
        }
      }

      if (
        descriptors.some(descriptor => descriptor.capabilities.nodeInventory)
      ) {
        if (nodeQuery?.isError) {
          // The inventory is readable but the node view is not: the panel
          // says so for this installation, the models still render.
          gpuCapacityUnavailable[installation] =
            (nodeQuery.error as Error | null)?.name === 'ForbiddenError'
              ? 'forbidden'
              : 'error';
        }
        for (const node of (nodeQuery?.data ?? []) as ModelManagerNode[]) {
          const descriptor = descriptorFor(descriptors, node.backend);
          gpuNodes.push(
            toGpuNodeFromManager(installation, node, descriptor?.backend),
          );
        }
      }
    });

    return {
      isLoading:
        isListing ||
        backendQueries.some(query => query.isLoading) ||
        modelQueries.some(query => query.isLoading) ||
        nodeQueries.some(query => query.isLoading),
      installations: active,
      backends: backendByInstallation,
      sourceBackends,
      capabilities,
      backendCapabilities,
      loading,
      backendLoading,
      sharedHosts,
      unreachableInstallations: Array.from(unreachable).sort(),
      servedModels,
      gpuNodes,
      gpuCapacityUnavailable,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    installationsKey,
    isListing,
    backends,
    backendSignature,
    modelsSignature,
    nodesSignature,
  ]);
}
