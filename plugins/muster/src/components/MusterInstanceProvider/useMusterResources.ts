import { useCallback, useMemo } from 'react';
import {
  type ErrorInfoUnion,
  type KubeObject,
  type KubeObjectInterface,
  type MultiVersionResourceMatcher,
  useResources,
  type UseResourcesQueryOptions,
} from '@giantswarm/backstage-plugin-kubernetes-react';

/**
 * muster's namespace: where its MCPServers and Workflows live, and where the
 * agent-platform chart lets every signed-in person list the MCPServers.
 */
export const MUSTER_NAMESPACE = 'agent-platform';

type ResourceClass<R extends KubeObject<any>> = (new (
  json: any,
  cluster: string,
) => R) & {
  getGVK(): MultiVersionResourceMatcher;
};

const isForbidden = (e: ErrorInfoUnion) =>
  e.type !== 'incompatibility' && e.error.name === 'ForbiddenError';

/**
 * A muster CR kind read cluster-wide, and in muster's namespace where the
 * person may not list it cluster-wide: a person with only the namespaced
 * `agent-platform:user` binding sees what they may read instead of a 403. A
 * namespace that refuses the list too means there is nothing the person may
 * read: an empty list, no error. Any other failure is reported as it is.
 */
export function useMusterResources<R extends KubeObject<any>>(
  clusters: string[],
  Resource: ResourceClass<R>,
  queryOptions: UseResourcesQueryOptions<KubeObjectInterface[]> = {},
) {
  const clusterWide = useResources(clusters, Resource, {}, queryOptions);

  const refused = useMemo(
    () =>
      Array.from(
        new Set(clusterWide.errors.filter(isForbidden).map(e => e.cluster)),
      ),
    [clusterWide.errors],
  );

  const namespaced = useResources(
    refused,
    Resource,
    Object.fromEntries(
      refused.map(cluster => [cluster, { namespace: MUSTER_NAMESPACE }]),
    ),
    { ...queryOptions, enabled: refused.length > 0 },
  );
  const isReadingNamespaced = refused.length > 0;

  const resources = useMemo(
    () =>
      isReadingNamespaced
        ? [...clusterWide.resources, ...namespaced.resources]
        : clusterWide.resources,
    [isReadingNamespaced, clusterWide.resources, namespaced.resources],
  );

  const errors = useMemo(
    () =>
      isReadingNamespaced
        ? [
            ...clusterWide.errors.filter(e => !isForbidden(e)),
            ...namespaced.errors.filter(e => !isForbidden(e)),
          ]
        : clusterWide.errors,
    [isReadingNamespaced, clusterWide.errors, namespaced.errors],
  );

  const queries = useMemo(
    () =>
      isReadingNamespaced
        ? [...clusterWide.queries, ...namespaced.queries]
        : clusterWide.queries,
    [isReadingNamespaced, clusterWide.queries, namespaced.queries],
  );

  const { retry: retryClusterWide } = clusterWide;
  const { retry: retryNamespaced } = namespaced;

  const retry = useCallback(() => {
    retryClusterWide();
    if (isReadingNamespaced) {
      retryNamespaced();
    }
  }, [retryClusterWide, retryNamespaced, isReadingNamespaced]);

  return {
    resources,
    errors,
    queries,
    isLoading:
      clusterWide.isLoading || (isReadingNamespaced && namespaced.isLoading),
    retry,
  };
}
