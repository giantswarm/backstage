import { kubernetesApiRef } from '@backstage/plugin-kubernetes';
import { CustomResourceMatcher } from '@backstage/plugin-kubernetes-common';
import { useApi } from '@backstage/core-plugin-api';
import { useQueries } from '@tanstack/react-query';
import type { List } from '@internal/plugin-gs-common';
import { useInstallations } from './useInstallations';
import { getInstallationsQueriesInfo } from './utils/queries';
import { getK8sListPath } from './utils/k8sPath';

export function useListResources<T>(gvkArray: CustomResourceMatcher[]) {
  const { selectedInstallations } = useInstallations();
  const kubernetesApi = useApi(kubernetesApiRef);
  const queries = useQueries({
    queries: selectedInstallations.flatMap(installationName => {
      return gvkArray.map(gvk => {
        const path = getK8sListPath(gvk);
        return {
          queryKey: [installationName, gvk.plural],
          queryFn: async () => {
            const response = await kubernetesApi.proxy({
              clusterName: installationName,
              path,
            });

            const list: List<T> = await response.json();

            return list.items;
          },
        };
      });
    }),
  });

  return getInstallationsQueriesInfo(selectedInstallations, queries);
}
