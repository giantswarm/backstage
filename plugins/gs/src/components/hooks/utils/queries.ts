import { Query, QueryCache, UseQueryResult } from '@tanstack/react-query';

export const getInstallationsQueriesInfo = <T>(
  installations: string[],
  queries: UseQueryResult<T, unknown>[],
) => {
  const installationsQueries = queries.map((query, idx) => {
    return {
      installationName: installations[idx],
      query,
    };
  });
  const fulfilledInstallationsQueries = installationsQueries.filter(
    ({ query }) => query.isSuccess,
  );
  const failedInstallationsQueries = installationsQueries.filter(
    ({ query }) => query.isError,
  );

  const installationsData = fulfilledInstallationsQueries.map(
    ({ installationName, query }) => ({
      installationName,
      data: query.data!,
    }),
  );

  const isLoading = queries.some(query => query.isLoading);
  const retry = () => {
    for (const query of queries) {
      query.refetch();
    }
  };
  const errors = failedInstallationsQueries.map(({ query }) => query.error);

  return {
    queries: installationsQueries,
    installationsData,
    isLoading,
    retry,
    errors,
  };
};

export function getInstallationsStatuses(queryCache: QueryCache) {
  const queries = queryCache.findAll({ type: 'active' });
  const queriesByInstallationName = new Map<string, Query[]>();
  queries.forEach(item => {
    const key = item.queryKey[0] ? (item.queryKey[0] as string) : null;
    if (key) {
      const collection = queriesByInstallationName.get(key);
      if (!collection) {
        queriesByInstallationName.set(key, [item]);
      } else {
        collection.push(item);
      }
    }
  });

  return Array.from(queriesByInstallationName).map(
    ([installationName, installationQueries]) => {
      const errors = installationQueries
        .filter(query => query.state.status === 'error')
        .map(query => [query.queryKey.join('/'), query.state.error as Error]);

      return {
        installationName,
        isLoading: installationQueries.some(
          query => query.state.status === 'pending',
        ),
        isError: installationQueries.some(
          query => query.state.status === 'error',
        ),
        errors: Object.fromEntries(errors),
      };
    },
  );
}
