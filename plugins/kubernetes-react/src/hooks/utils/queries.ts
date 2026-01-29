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
