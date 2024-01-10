import { gsApiRef } from '../../apis';
import { useApi } from '@backstage/core-plugin-api';
import { useInstallations } from './useInstallations';
import { useQueries } from '@tanstack/react-query';
import { IHelmRelease } from '../../model/services/mapi/helmv2beta1';
import { getInstallationsQueriesInfo } from './utils';

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

  return getInstallationsQueriesInfo<IHelmRelease[]>(selectedInstallations, queries);
}
