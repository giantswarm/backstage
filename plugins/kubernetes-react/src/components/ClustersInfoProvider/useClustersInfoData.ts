import { useEffect, useMemo } from 'react';
import useAsync from 'react-use/esm/useAsync';
import useLocalStorageState from 'use-local-storage-state';
import { useApi } from '@backstage/core-plugin-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { useUrlState } from './useUrlState';
// import { useQuery } from '@tanstack/react-query';

const disabledClusters: string[] = [];
const isLoadingDisabledClusters = false;

export const useClustersInfoData = ({
  persistToURL,
}: {
  persistToURL: boolean;
}): {
  clusters: string[];
  isLoadingClusters: boolean;
  activeClusters: string[];
  activeCluster: string | null;
  selectedClusters: string[];
  setSelectedClusters: (items: string[]) => void;
  selectedCluster: string | null;
  setSelectedCluster: (item: string | null) => void;
} => {
  const kubernetesApi = useApi(kubernetesApiRef);
  const { value: clusters, loading: isLoadingClusters } = useAsync(async () => {
    const kuberentesClusters = await kubernetesApi.getClusters();

    return kuberentesClusters.map(c => c.name);
  });

  const [clustersFromLocalStorage, setClustersToLocalStorage] =
    useLocalStorageState<string[]>('gs-kubernetes-clusters', {
      defaultValue: [],
    });
  const { value: clustersParams, setValue: setClustersToURL } =
    useUrlState('clusters');
  const clustersFromURL: string[] | undefined = clustersParams;
  console.log('clustersFromURL', clustersFromURL);

  const [clusterFromLocalStorage, setClusterToLocalStorage] =
    useLocalStorageState<string | null>('gs-kubernetes-cluster', {
      defaultValue: null,
    });
  const { value: clusterParams, setValue: setClusterToURL } =
    useUrlState('cluster');
  const clusterFromURL: string | null = clusterParams[0] ?? null;
  console.log('clusterFromURL', clusterFromURL);

  // useEffect(() => {
  //   console.log('sync');
  //   if (clusterValue && clusterValue !== clusterFromURL) {
  //     console.log('sync to url');
  //     setClusterToURL(clusterValue);
  //   }

  //   if (clusterValue && clusterValue !== clusterFromLocalStorage) {
  //     console.log('sync to local storage');
  //     setClusterToLocalStorage(clusterValue);
  //   }
  // }, [
  //   clusterValue,
  //   setClusterToURL,
  //   setClusterToLocalStorage,
  //   clusterFromURL,
  //   clusterFromLocalStorage,
  // ]);

  // const configApi = useApi(configApiRef);
  // const installationsConfig = configApi.getOptionalConfig('gs.installations');
  // if (!installationsConfig) {
  //   throw new Error(`Missing gs.installations configuration`);
  // }

  // const installations = configApi.getConfig('gs.installations').keys();

  const clustersValue = clustersFromURL ?? clustersFromLocalStorage;
  const selectedClusters = useMemo(() => {
    if (!clusters) {
      return [];
    }

    return clusters.filter(cluster => clustersValue.includes(cluster));
  }, [clusters, clustersValue]);

  const clusterValue = clusterFromURL ?? clusterFromLocalStorage;
  const selectedCluster = clusters
    ? (clusters.find(cluster => cluster === clusterValue) ?? null)
    : null;

  const setSelectedClusters = (items: string[]) => {
    const itemsToSave = [items].flat().filter(Boolean) as string[];
    setClustersToLocalStorage(itemsToSave);
    setClustersToURL(itemsToSave);
  };

  const setSelectedCluster = (item: string | null) => {
    setClusterToLocalStorage(item);
    setClusterToURL(item);
  };

  useEffect(() => {
    if (!clusters) {
      return;
    }

    if (
      JSON.stringify(selectedClusters.sort()) !==
      JSON.stringify(clustersFromLocalStorage.sort())
    ) {
      console.log('sync clusters to local storage');
      setClustersToLocalStorage(selectedClusters);
    }

    if (
      JSON.stringify(selectedClusters.sort()) !==
      JSON.stringify(clustersFromURL.sort())
    ) {
      console.log('sync clusters to url');
      setClustersToURL(selectedClusters);
    }

    //   // console.log('selectedCluster', selectedCluster);
    //   // console.log('clusterFromLocalStorage', clusterFromLocalStorage);
    if (selectedCluster !== clusterFromLocalStorage) {
      console.log('sync cluster to local storage');
      setClusterToLocalStorage(selectedCluster);
    }

    if (selectedCluster !== clusterFromURL) {
      console.log('sync cluster to url');
      setClusterToURL(selectedCluster);
    }
  }, [
    clusterFromLocalStorage,
    clusterFromURL,
    clusters,
    clustersFromLocalStorage,
    clustersFromURL,
    selectedCluster,
    selectedClusters,
    setClusterToLocalStorage,
    setClusterToURL,
    setClustersToLocalStorage,
    setClustersToURL,
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
