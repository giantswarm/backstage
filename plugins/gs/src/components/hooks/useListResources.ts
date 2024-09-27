import { kubernetesApiRef } from '@backstage/plugin-kubernetes';
import { CustomResourceMatcher } from '@backstage/plugin-kubernetes-common';
import { useApi } from '@backstage/core-plugin-api';
import { useQueries } from '@tanstack/react-query';
import type { List } from '@giantswarm/backstage-plugin-gs-common';
import { useInstallations } from './useInstallations';
import { getInstallationsQueriesInfo } from './utils/queries';
import { getK8sListPath } from './utils/k8sPath';

export function useListResources<T>(
  gvkArray: CustomResourceMatcher[],
  installations?: string[],
  namespace?: string,
) {
  const { selectedInstallations: savedInstallations } = useInstallations();
  const selectedInstallations = installations ?? savedInstallations;

  const kubernetesApi = useApi(kubernetesApiRef);
  const queries = useQueries({
    queries: selectedInstallations.flatMap(installationName => {
      return gvkArray.map(gvk => {
        const path = getK8sListPath(gvk, namespace);
        return {
          queryKey: [installationName, gvk.plural],
          queryFn: async () => {
            const response = await kubernetesApi.proxy({
              clusterName: installationName,
              path,
            });

            if (!response.ok) {
              const error = new Error(
                `Failed to fetch resources from ${installationName} at ${path}. Reason: ${response.statusText}.`,
              );
              error.name =
                response.status === 404 ? 'NotFoundError' : error.name;

              throw error;
            }

            const list: List<T> = await response.json();

            return list.items;
          },
        };
      });
    }),
  });

  return getInstallationsQueriesInfo(selectedInstallations, queries);
}
