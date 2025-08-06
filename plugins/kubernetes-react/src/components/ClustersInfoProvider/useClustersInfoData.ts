import { useEffect, useMemo } from 'react';
import useAsync from 'react-use/esm/useAsync';
import useLocalStorageState from 'use-local-storage-state';
import { useApi } from '@backstage/core-plugin-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
// import { useQuery } from '@tanstack/react-query';

const disabledClusters: string[] = [];
const isLoadingDisabledClusters = false;

export const useClustersInfoData = (): {
  clusters: string[];
  isLoadingClusters: boolean;
  activeClusters: string[];
  activeCluster: string | null;
  selectedClusters: string[];
  setSelectedClusters: (items: string[]) => void;
  selectedCluster: string | null;
  setSelectedCluster: (item: string | null) => void;
} => {
  const [savedClusters, setSavedClusters] = useLocalStorageState<string[]>(
    'gs-kubernetes-clusters',
    {
      defaultValue: [],
    },
  );
  const [savedCluster, setSavedCluster] = useLocalStorageState<string | null>(
    'gs-kubernetes-cluster',
    {
      defaultValue: null,
    },
  );
  // const configApi = useApi(configApiRef);
  // const installationsConfig = configApi.getOptionalConfig('gs.installations');
  // if (!installationsConfig) {
  //   throw new Error(`Missing gs.installations configuration`);
  // }

  // const installations = configApi.getConfig('gs.installations').keys();

  const kubernetesApi = useApi(kubernetesApiRef);
  const { value: clusters, loading: isLoadingClusters } = useAsync(async () => {
    const kuberentesClusters = await kubernetesApi.getClusters();

    return kuberentesClusters.map(c => c.name);
  });

  const selectedClusters = useMemo(() => {
    if (!clusters) {
      return [];
    }

    return clusters.filter(cluster => savedClusters.includes(cluster));
  }, [clusters, savedClusters]);

  const selectedCluster = clusters
    ? (clusters.find(cluster => cluster === savedCluster) ?? null)
    : null;

  const setSelectedClusters = (items: string[]) => {
    const itemsToSave = [items].flat().filter(Boolean) as string[];
    setSavedClusters(itemsToSave);
  };

  const setSelectedCluster = (item: string | null) => {
    setSavedCluster(item);
  };

  useEffect(() => {
    if (!clusters) {
      return;
    }

    if (
      JSON.stringify(selectedClusters.sort()) !==
      JSON.stringify(savedClusters.sort())
    ) {
      setSavedClusters(selectedClusters);
    }

    if (selectedCluster !== savedCluster) {
      setSavedCluster(selectedCluster);
    }
  }, [
    selectedClusters,
    savedClusters,
    setSavedClusters,
    selectedCluster,
    savedCluster,
    setSavedCluster,
    clusters,
  ]);

  const activeClusters = useMemo(() => {
    if (!clusters) {
      return [];
    }

    const allSelectedClusters =
      clusters.length === 1 || selectedClusters.length === 0
        ? clusters
        : selectedClusters;

    if (
      allSelectedClusters.some(cluster => disabledClusters.includes(cluster)) &&
      isLoadingDisabledClusters
    ) {
      return []; // Some selected installations are potentially disabled, waiting for status check to complete
    }

    return allSelectedClusters.filter(
      cluster => !disabledClusters.includes(cluster),
    );
  }, [clusters, selectedClusters]);

  const activeCluster = useMemo(() => {
    if (!clusters || !selectedCluster) {
      return null;
    }

    if (disabledClusters.includes(selectedCluster)) {
      return null;
    }

    return selectedCluster;
  }, [clusters, selectedCluster]);

  return {
    clusters: clusters ?? [],
    isLoadingClusters,
    activeClusters,
    activeCluster,
    selectedClusters,
    selectedCluster,
    setSelectedClusters,
    setSelectedCluster,
  };
};
