import { useQueries } from '@tanstack/react-query';
import { gsApiRef } from '../apis';
import { useApi } from '@backstage/core-plugin-api';
import { ICluster } from '../model/services/mapi/capiv1beta1';
import { useInstallations } from './useInstallations';
import { getInstallationsQueriesInfo } from './utils';

export function useClusters() {
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

  return getInstallationsQueriesInfo<ICluster[]>(selectedInstallations, queries);
}
