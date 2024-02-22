import { kubernetesApiRef } from '@backstage/plugin-kubernetes';
import { CustomResourceMatcher } from '@backstage/plugin-kubernetes-common';
import { useApi } from '@backstage/core-plugin-api';
import { useInstallations } from './useInstallations';
import { useK8sListPath } from './useK8sPath';
import { useQueries } from '@tanstack/react-query';
import { getInstallationsQueriesInfo } from './utils';
import { IList } from '../../model/services/mapi/metav1';

export function useListResources<T>(gvk: CustomResourceMatcher) {
  const {
    selectedInstallations,
  } = useInstallations();
  const kubernetesApi = useApi(kubernetesApiRef);
  const path = useK8sListPath(gvk);
  const queries = useQueries({
    queries: selectedInstallations.map(installationName => {
      return {
        queryKey: [installationName, gvk.plural],
        queryFn: async () => {
          const response = await kubernetesApi.proxy({
            clusterName: installationName,
            path,
          });

          const list: IList<T> = await response.json();

          return list.items;
        },
      };
    }),
  });

  return getInstallationsQueriesInfo(selectedInstallations, queries);
}
