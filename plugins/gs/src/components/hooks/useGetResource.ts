import { useApi } from '@backstage/core-plugin-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes';
import { CustomResourceMatcher } from '@backstage/plugin-kubernetes-common';
import { useQuery } from '@tanstack/react-query';
import { useK8sGetPath } from './useK8sPath';

export function useGetResource<T>(
  installationName: string,
  gvk: CustomResourceMatcher,
  name: string,
  namespace?: string,
) {
  const kubernetesApi = useApi(kubernetesApiRef);
  const path = useK8sGetPath(gvk, name, namespace);

  const queryKey = [
    installationName,
    'get',
    gvk.plural,
    namespace,
    name,
  ].filter(Boolean) as string[];

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const response = await kubernetesApi.proxy({
        clusterName: installationName,
        path,
      });

      if (!response.ok) {
        const error = new Error(
          `Failed to fetch resources from ${installationName} at ${path}. Reason: ${response.statusText}.`,
        );
        error.name = response.status === 404 ? 'NotFoundError' : error.name;

        throw error;
      }

      const app: T = await response.json();

      return app;
    },
  });

  return {
    ...query,
    queryKey: queryKey.join('/'),
  };
}
