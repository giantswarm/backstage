import { Query, QueryCache, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import debounce from 'lodash/debounce';
import { ErrorInfo } from '../utils/queries';

function getClusterStatuses(queryCache: QueryCache) {
  const queries = queryCache
    .findAll({ type: 'active' })
    .filter(query => query.queryKey[0] && query.queryKey[0] === 'cluster');
  const queriesByCluster = new Map<string, Query[]>();
  queries.forEach(item => {
    const cluster = item.queryKey[1] ? (item.queryKey[1] as string) : null;
    if (cluster) {
      const collection = queriesByCluster.get(cluster);
      if (!collection) {
        queriesByCluster.set(cluster, [item]);
      } else {
        collection.push(item);
      }
    }
  });

  return Array.from(queriesByCluster).map(([cluster, clusterQueries]) => {
    const errors: ErrorInfo[] = clusterQueries
      .filter(query => query.state.status === 'error')
      .map(query => ({
        cluster,
        error: query.state.error as Error,
        retry: () => {},
      }));

    return {
      cluster,
      isLoading: clusterQueries.some(query => query.state.status === 'pending'),
      isError: clusterQueries.some(query => query.state.status === 'error'),
      errors,
    };
  });
}

export type ClusterStatus = {
  cluster: string;
  isLoading: boolean;
  isError: boolean;
  errors: ErrorInfo[];
};

export const useClusterQueries = (): {
  clusterStatuses: ClusterStatus[];
} => {
  const queryClient = useQueryClient();
  const queryCache = queryClient.getQueryCache();
  const [clusterStatuses, setClusterStatuses] = useState<ClusterStatus[]>(
    getClusterStatuses(queryCache),
  );

  const clusterStatusesHash = JSON.stringify(clusterStatuses);
  useEffect(() => {
    const debouncedUpdate = debounce(() => {
      const statuses = getClusterStatuses(queryCache);

      if (clusterStatusesHash !== JSON.stringify(statuses)) {
        setClusterStatuses(statuses);
      }
    }, 200);

    return queryCache.subscribe(debouncedUpdate);
  }, [clusterStatusesHash, queryCache]);

  return {
    clusterStatuses,
  };
};
