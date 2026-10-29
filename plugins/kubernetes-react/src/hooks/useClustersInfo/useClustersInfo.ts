import { useApi } from '@backstage/core-plugin-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { useIsRestoring, useQuery } from '@tanstack/react-query';
import { isAwaitingData } from '@giantswarm/backstage-plugin-ui-react';

export function useClustersInfo() {
  const isRestoring = useIsRestoring();
  const kubernetesApi = useApi(kubernetesApiRef);

  const clustersQuery = useQuery({
    queryKey: ['kubernetes-clusters'],
    queryFn: async () => {
      const kuberentesClusters = await kubernetesApi.getClusters();

      return kuberentesClusters.map(c => c.name);
    },
  });

  return {
    clusters: clustersQuery.data ?? [],
    isLoading: isRestoring || isAwaitingData(clustersQuery),
  };
}
