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

  return useQuery({
    queryKey: [installationName, gvk.plural, namespace, name],
    queryFn: async () => {
      const response = await kubernetesApi.proxy({
        clusterName: installationName,
        path,
      });

      const app: T = await response.json();

      return app;
    },
  });
}
