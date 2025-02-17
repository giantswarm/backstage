import { useApi } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { useK8sGetPath } from './useK8sPath';
import { CustomResourceMatcher } from '../../apis/kubernetes';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';

export function useGetResource<T>(
  {
    installationName,
    gvk,
    name,
    namespace,
  }: {
    installationName: string;
    gvk: CustomResourceMatcher;
    name: string;
    namespace?: string;
  },
  { enabled = true },
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
        error.name = response.status === 403 ? 'ForbiddenError' : error.name;
        error.name = response.status === 404 ? 'NotFoundError' : error.name;

        throw error;
      }

      const app: T = await response.json();

      return app;
    },
    enabled,
  });

  return {
    ...query,
    queryKey: queryKey.join('/'),
  };
}
