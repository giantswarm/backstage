import { UseQueryResult } from "@tanstack/react-query";

export const getInstallationsQueriesInfo = <T>(installations: string[], queries: UseQueryResult<T, unknown>[]) => {
  const installationsQueries = queries.map((query, idx) => {
    return {
      installationName: installations[idx],
      query,
    }
  });
  const fulfilledInstallationsQueries = installationsQueries.filter(
    ({ query }) => query.isSuccess
  );

  const installationsData = fulfilledInstallationsQueries.map(({ installationName, query }) => ({ installationName, data: query.data! }));

  const initialLoading = queries.some((query) => query.isLoading) && !queries.some((query) => query.isSuccess);
  const retry = () => {
    for (const query of queries) {
      query.refetch();
    }
  }

  return {
    queries: installationsQueries,
    installationsData,
    initialLoading,
    retry,
  }
}
