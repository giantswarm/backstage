import { useApi } from '@backstage/core-plugin-api';
import { useQueries } from '@tanstack/react-query';
import type { List } from '@giantswarm/backstage-plugin-gs-common';
import { getInstallationsQueriesInfo } from './utils/queries';
import { getK8sListPath } from './utils/k8sPath';
import { CustomResourceMatcher } from '../../apis/kubernetes';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';

export function useListResources<T>(
  installations: string[],
  installationsGVKs: { [installationName: string]: CustomResourceMatcher },
  namespace?: string,
) {
  const kubernetesApi = useApi(kubernetesApiRef);
  const queries = useQueries({
    queries: installations.map(installationName => {
      const gvk = installationsGVKs[installationName];
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
              response.status === 403 ? 'ForbiddenError' : error.name;
            error.name = response.status === 404 ? 'NotFoundError' : error.name;

            throw error;
          }

          const list: List<T> = await response.json();

          return list.items;
        },
      };
    }),
  });

  return getInstallationsQueriesInfo(installations, queries);
}
