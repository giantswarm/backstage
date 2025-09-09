import { useApi } from '@backstage/core-plugin-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { useIsRestoring, useQuery } from '@tanstack/react-query';

export function useClustersInfo() {
  const isRestoring = useIsRestoring();
  const kubernetesApi = useApi(kubernetesApiRef);

  const { data: clusters, isLoading: isLoadingClusters } = useQuery({
    queryKey: ['kubernetes-clusters'],
    queryFn: async () => {
      const kuberentesClusters = await kubernetesApi.getClusters();

      return kuberentesClusters.map(c => c.name);
    },
  });

  return {
    clusters: clusters ?? [],
    isLoading: isRestoring || isLoadingClusters,
  };
}
