import { UseQueryResult } from '@tanstack/react-query';
import { IncompatibilityState } from '../../lib/k8s/VersionTypes';

/**
 * Error info for regular fetch errors.
 */
export type ErrorInfo = {
  type?: 'error';
  cluster: string;
  error: Error;
  retry: VoidFunction;
};

/**
 * Error info for API version incompatibility errors.
 */
export type IncompatibilityErrorInfo = {
  type: 'incompatibility';
  cluster: string;
  incompatibility: IncompatibilityState;
};

/**
 * Union type for all error types that can be displayed.
 */
export type ErrorInfoUnion = ErrorInfo | IncompatibilityErrorInfo;

/**
 * True when a list/get failed with a 404 — the resource's API group/CRD is not
 * served by that cluster (see the `NotFoundError` name set in `useListResources`).
 * Distinct from a 403 (`ForbiddenError`) or a transport failure, so callers can
 * treat it as "this resource type isn't installed here" rather than
 * "couldn't read".
 */
export function isNotFoundError(errorInfo: ErrorInfoUnion): boolean {
  return (
    errorInfo.type !== 'incompatibility' &&
    errorInfo.error.name === 'NotFoundError'
  );
}

export const mapQueriesToClusters = <T>(
  clusters: string[],
  queries: UseQueryResult<T, unknown>[],
) => {
  const clustersQueries = queries.map((query, idx) => {
    return {
      cluster: clusters[idx],
      query,
    };
  });
  const fulfilledClustersQueries = clustersQueries.filter(
    ({ query }) => query.isSuccess,
  );
  const failedClustersQueries = clustersQueries.filter(
    ({ query }) => query.isError,
  );

  const clustersData = fulfilledClustersQueries.map(({ cluster, query }) => ({
    cluster,
    data: query.data!,
  }));
  const clustersErrors: ErrorInfo[] = failedClustersQueries.map(
    ({ cluster, query }) => ({
      cluster,
      error: query.error as Error,
      retry: query.refetch,
    }),
  );

  const isLoading = queries.some(query => query.isLoading);
  const retry = () => {
    for (const query of queries) {
      query.refetch();
    }
  };

  return {
    queries: clustersQueries,
    errors: clustersErrors,
    clustersData,
    isLoading,
    retry,
  };
};
