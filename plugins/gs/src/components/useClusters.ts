import { useQueries } from '@tanstack/react-query';
import { gsApiRef } from '../apis';
import { useApi } from '@backstage/core-plugin-api';
import { ICluster } from '../model/services/mapi/capiv1beta1';
import { InstallationQueriesResult, useInstallations } from './useInstallations';

export function useClusters(): InstallationQueriesResult<ICluster[]> {
  const {
    selectedInstallations,
  } = useInstallations();
  const api = useApi(gsApiRef);

  const queries = useQueries({
    queries: selectedInstallations.map(installationName => {
      return {
        queryKey: [installationName, 'clusters'],
        queryFn: () => api.listClusters({ installationName }),
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
