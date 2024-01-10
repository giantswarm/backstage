import { gsApiRef } from '../../apis';
import { useApi } from '@backstage/core-plugin-api';
import { useInstallations } from './useInstallations';
import { useQueries } from '@tanstack/react-query';
import { IApp } from '../../model/services/mapi/applicationv1alpha1';
import { getInstallationsQueriesInfo } from './utils';

export function useApps() {
  const {
    selectedInstallations,
  } = useInstallations();
  const api = useApi(gsApiRef);

  const queries = useQueries({
    queries: selectedInstallations.map(installationName => {
      return {
        queryKey: [installationName, 'apps'],
        queryFn: () => api.listApps({ installationName }),
      }
    }),
  });

  return getInstallationsQueriesInfo<IApp[]>(selectedInstallations, queries);
}
