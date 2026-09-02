import { useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { useQueries } from '@tanstack/react-query';
import { modelManagerApiRef } from '../../apis';
import { useModelManagerInstallations } from '../../hooks/useModelManagerInstallations';
import type {
  ModelManagerBackend,
  ModelManagerModel,
} from '../../lib/modelManager';
import {
  toServedModelFromManager,
  toServingBackend,
  toServingCapabilities,
} from '../../lib/modelManagerServing';
import {
  modelManagerBackendQueryKey,
  modelManagerModelsQueryKey,
} from '../../lib/queryKeys';
import type {
  ServingBackend,
  ServingCapabilities,
  ServingSourceSnapshot,
} from '../../lib/serving';

/**
 * The backend descriptor changes when model-manager is reconfigured, and its
 * `healthy` flag when the host backend goes away — so re-read it now and
 * then, but not on every render.
 */
export const BACKEND_REFETCH_MS = 60_000;

/**
 * The inventory changes under the portal's feet: a `keep_alive` expiring
 * unloads a model, a pull started from an agent (MCP) adds one. Poll while the
 * section is visible; mutations invalidate on top.
 */
export const MODELS_REFETCH_MS = 30_000;

/** Which backend descriptors were readable, by installation. */
type BackendByInstallation = Record<
  string,
  ModelManagerBackend & { backend: ServingBackend }
>;

/**
 * The model-manager serving source: the inventory of the installations the
 * backend proxies a model-manager for, read through the model-manager REST
 * API with the user's own installation token.
 *
 * Per installation with a model-manager (nothing at all is read elsewhere):
 * 1. `GET /api/v1/backend` — which backend (Ollama, KServe), whether it is
 *    healthy, and the capability flags that decide which controls render;
 * 2. `GET /api/v1/models` — the downloaded models, each already carrying its
 *    loaded state, memory footprint and the ModelConfig model-manager created
 *    for it. (`/api/v1/loaded` says nothing more, so it is not read here.)
 *
 * Degradation: an installation whose descriptor or inventory cannot be read
 * (the gateway rejected the token, model-manager or its host backend is down,
 * the user is not signed in there) is surfaced as unreachable — never dropped
 * silently, since the operator configured a model-manager there. An
 * installation whose backend is one this portal has no vocabulary for is
 * skipped with a console warning.
 *
 * Contributes no GPU nodes: a backend that has a node inventory says so with
 * `nodeInventory`, and rendering it is a later concern; on Ollama the panel is
 * simply absent.
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
      queryFn: () => modelManagerApi.getBackend(installation),
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

  const backends = useMemo<BackendByInstallation>(() => {
    const result: BackendByInstallation = {};
    installations.forEach((installation, index) => {
      const descriptor = backendQueries[index]?.data;
      if (!descriptor) {
        return;
      }
      const backend = toServingBackend(descriptor.backend);
      if (!backend) {
        // eslint-disable-next-line no-console
        console.warn(
          `[agent-platform] model-manager on ${installation} reports backend '${descriptor.backend}', which this portal does not know; skipping it.`,
        );
        return;
      }
      result[installation] = { ...descriptor, backend };
    });
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installationsKey, backendSignature]);

  const modelQueries = useQueries({
    queries: installations.map(installation => ({
      queryKey: modelManagerModelsQueryKey(installation),
      queryFn: () => modelManagerApi.listModels(installation),
      // Only once the backend answered: without a descriptor there is no
      // vocabulary to render the models in, and a failing descriptor already
      // marks the installation unreachable.
      enabled: Boolean(backends[installation]),
      staleTime: 10_000,
      refetchInterval: MODELS_REFETCH_MS,
    })),
  });

  const modelsSignature = modelQueries
    .map(query => `${query.status}:${query.isLoading}:${query.dataUpdatedAt}`)
    .join('|');

  return useMemo<ServingSourceSnapshot>(() => {
    const active: string[] = [];
    const backendByInstallation: Record<string, ServingBackend> = {};
    const capabilities: Record<string, ServingCapabilities> = {};
    const unreachable = new Set<string>();
    const servedModels: ServingSourceSnapshot['servedModels'] = [];

    installations.forEach((installation, index) => {
      const backendQuery = backendQueries[index];
      const modelQuery = modelQueries[index];
      const descriptor = backends[installation];

      if (backendQuery?.isError) {
        unreachable.add(installation);
        return;
      }
      if (!descriptor) {
        // Still loading, or an unknown backend (already warned about).
        return;
      }

      active.push(installation);
      backendByInstallation[installation] = descriptor.backend;
      capabilities[installation] = toServingCapabilities(
        descriptor.capabilities,
      );

      if (modelQuery?.isError) {
        // The backend is known but its inventory is not readable (its host
        // Ollama down, the gateway rejecting this call): the section still
        // shows the installation, and says it could not be read.
        unreachable.add(installation);
        return;
      }
      for (const model of (modelQuery?.data ?? []) as ModelManagerModel[]) {
        servedModels.push(
          toServedModelFromManager(installation, descriptor, model),
        );
      }
    });

    return {
      isLoading:
        isListing ||
        backendQueries.some(query => query.isLoading) ||
        modelQueries.some(query => query.isLoading),
      installations: active,
      backends: backendByInstallation,
      capabilities,
      unreachableInstallations: Array.from(unreachable).sort(),
      servedModels,
      gpuNodes: [],
      gpuCapacityUnavailable: {},
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    installationsKey,
    isListing,
    backends,
    backendSignature,
    modelsSignature,
  ]);
}
