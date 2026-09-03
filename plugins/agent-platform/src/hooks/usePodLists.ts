import { useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { useQueries } from '@tanstack/react-query';
import {
  Pod,
  type PodInterface,
} from '@giantswarm/backstage-plugin-kubernetes-react';

/** One pod list to run: an installation plus the server-side narrowing. */
export type PodListRequest = {
  installation: string;
  namespace?: string;
  /** Raw `labelSelector` value, e.g. `serving.kserve.io/inferenceservice`. */
  labelSelector?: string;
  /** Raw `fieldSelector` value, e.g. `spec.nodeName=gpu-node-1`. */
  fieldSelector?: string;
};

export function podListPath(request: PodListRequest): string {
  const base = request.namespace
    ? `/api/v1/namespaces/${request.namespace}/pods`
    : '/api/v1/pods';
  const params = new URLSearchParams();
  if (request.labelSelector) {
    params.set('labelSelector', request.labelSelector);
  }
  if (request.fieldSelector) {
    params.set('fieldSelector', request.fieldSelector);
  }
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

export type PodListResult = {
  request: PodListRequest;
  /** Hydrated pods; `undefined` until the list answered (or if it failed). */
  pods?: Pod[];
  error?: Error;
};

export type PodLists = {
  results: PodListResult[];
  isLoading: boolean;
};

/**
 * Runs a variable number of narrowed pod lists — one per (installation,
 * selector) pair — with the user's own RBAC.
 *
 * `useResources` runs exactly one list per installation and speaks only
 * `matchingLabels` equality; the serving views need an *exists* label selector
 * (every KServe predictor pod, all namespaces) and per-node `fieldSelector`
 * lists (the pods occupying one GPU node), and how many of those there are is
 * only known once nodes have been read. Hence this thin sibling over the same
 * proxy, keyed like `useListResources` (`['cluster', <installation>, 'list',
 * 'v1', 'pods', <path>]`) so the two never collide and invalidate alike.
 *
 * Errors keep the list convention: 403 is `ForbiddenError`, 404 `NotFoundError`.
 */
export function usePodLists(requests: PodListRequest[]): PodLists {
  const kubernetesApi = useApi(kubernetesApiRef);

  const combined = useQueries({
    queries: requests.map(request => {
      const path = podListPath(request);
      return {
        queryKey: ['cluster', request.installation, 'list', 'v1', 'pods', path],
        queryFn: async (): Promise<PodInterface[]> => {
          const response = await kubernetesApi.proxy({
            clusterName: request.installation,
            path,
          });
          if (!response.ok) {
            const reason = response.statusText || `HTTP ${response.status}`;
            const error = new Error(
              `Failed to list pods on ${request.installation} at ${path}. Reason: ${reason}.`,
            );
            if (response.status === 403) {
              error.name = 'ForbiddenError';
            } else if (response.status === 404) {
              error.name = 'NotFoundError';
            }
            throw error;
          }
          const list: { items?: PodInterface[] } = await response.json();
          // Raw JSON into the cache (it is persisted and structurally shared);
          // instances are hydrated below.
          return list.items ?? [];
        },
      };
    }),
    combine: results => ({
      // Structural sharing keeps this stable across renders while nothing
      // changed, which is what lets the hydration below memoize.
      items: results.map(result => result.data),
      errors: results.map(
        result => (result.error as Error | null) ?? undefined,
      ),
      isLoading: results.some(result => result.isLoading),
    }),
  });

  const requestsKey = requests.map(podListPath).join('|');
  const results = useMemo<PodListResult[]>(
    () =>
      requests.map((request, index) => ({
        request,
        pods: combined.items[index]?.map(
          item => new Pod(item, request.installation),
        ),
        error: combined.errors[index],
      })),
    // `requests` is rebuilt by callers each render; key on its contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [combined.items, combined.errors, requestsKey],
  );

  return { results, isLoading: combined.isLoading };
}
