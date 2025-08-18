import { createContext, ReactNode } from 'react';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { useApi } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';

export type ClustersInfo = {
  clusters: string[];
  isLoadingClusters: boolean;
  disabledClusters: string[];
};

export const KubernetesClustersInfoContext = createContext<ClustersInfo | null>(
  null,
);

export function assertKubernetesClustersInfoContext(
  value: any,
): asserts value is ClustersInfo {
  if (value === null) {
    throw new Error('KubernetesClustersInfoContext not found');
  }
}

export const KubernetesClustersInfoProvider = ({
  children,
  disabledClusters = [],
}: {
  children: ReactNode;
  disabledClusters?: string[];
}) => {
  const kubernetesApi = useApi(kubernetesApiRef);
  const { data: clusters, isLoading: isLoadingClusters } = useQuery({
    queryKey: ['kubernetes-clusters'],
    queryFn: async () => {
      const kuberentesClusters = await kubernetesApi.getClusters();

      return kuberentesClusters.map(c => c.name);
    },
  });

  const clustersInfo = {
    clusters: clusters ?? [],
    isLoadingClusters,
    disabledClusters,
  };

  return (
    <KubernetesClustersInfoContext.Provider value={clustersInfo}>
      {children}
    </KubernetesClustersInfoContext.Provider>
  );
};
