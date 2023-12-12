import { gsApiRef } from '../apis';
import { useApi } from '@backstage/core-plugin-api';
import { useInstallations } from './useInstallations';
import { useQueries } from '@tanstack/react-query';

export function useHelmReleases() {
  const {
    selectedInstallations,
  } = useInstallations();
  const api = useApi(gsApiRef);

  const queries = useQueries({
    queries: selectedInstallations.map(installationName => {
      return {
        queryKey: [installationName, 'helmreleases'],
        queryFn: () => api.listHelmReleases({ installationName }),
      }
    }),
  });

  const installationsQueries = queries.map((query, idx) => {
    return {
      installationName: selectedInstallations[idx],
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
