import { useQueries, UseQueryResult } from '@tanstack/react-query';
import { gsApiRef } from '../apis';
import { useApi } from '@backstage/core-plugin-api';
import { ICluster } from '../model/services/mapi/capiv1beta1';
import { useInstallations } from './useInstallations';

type Options = {
  namespace?: string;
};

type InstallationQuery<T> = {
  installationName: string;
  query: UseQueryResult<T, unknown>;
};

type InstallationQueryData<T> = {
  installationName: string;
  data: T;
};

type InstallationQueriesResult<T> = {
  queries: InstallationQuery<T>[];
  installationsData: InstallationQueryData<T>[];
  initialLoading: boolean;
  retry: () => void;
};

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

  const installationQueries = queries.map((query, idx) => {
    return {
      installationName: selectedInstallations[idx],
      query,
    }
  });
  const fulfilledInstallationQueries = installationQueries.filter(
    ({ query }) => query.isSuccess
  );

  const installationsData = fulfilledInstallationQueries.map(({ installationName, query }) => ({ installationName, data: query.data! }));

  const initialLoading = queries.some((query) => query.isLoading) && !queries.some((query) => query.isSuccess);
  const retry = () => {
    for (const query of queries) {
      query.refetch();
    }
  }

  return {
    queries: installationQueries,
    installationsData,
    initialLoading,
    retry,
  }
}
