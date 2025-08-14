import { useEffect, useState } from 'react';
import useLocalStorageState from 'use-local-storage-state';
import { Autocomplete } from '@giantswarm/backstage-plugin-ui-react';
import { useClustersInfo } from '../../hooks';
import { useUrlState } from '../../hooks/useUrlState';

function useValue({
  persistToLocalStorage,
  persistToURL,
}: {
  persistToLocalStorage: boolean;
  persistToURL: boolean;
}) {
  const [valueFromState, setValueToState] = useState<string | null>(null);

  const [valueFromLocalStorage, setValueToLocalStorage] = useLocalStorageState<
    string | null
  >('gs-kubernetes-cluster', {
    defaultValue: null,
  });
  const { value: clusterParams, setValue: setValueToURL } =
    useUrlState('cluster');
  const valueFromURL: string | null = clusterParams[0] ?? null;

  let value = valueFromState;
  if (persistToLocalStorage && valueFromLocalStorage) {
    value = valueFromLocalStorage;
  }
  if (persistToURL && valueFromURL) {
    value = valueFromURL;
  }

  const setValue = (newValue: string | null) => {
    if (newValue !== valueFromState) {
      setValueToState(newValue);
    }
    if (persistToLocalStorage && newValue !== valueFromLocalStorage) {
      setValueToLocalStorage(newValue);
    }
    if (persistToURL && newValue !== valueFromURL) {
      setValueToURL(newValue);
    }
  };

  return { value, setValue };
}

type ClusterSelectorProps = {
  persistToLocalStorage?: boolean;
  persistToURL?: boolean;
  onChange?: (selectedCluster: string | null) => void;
};

export const SingleClusterSelector = ({
  persistToLocalStorage = true,
  persistToURL = true,
  onChange,
}: ClusterSelectorProps) => {
  const { clusters, isLoadingClusters } = useClustersInfo();

  const { value, setValue } = useValue({
    persistToLocalStorage,
    persistToURL,
  });

  const selectedCluster = clusters.find(cluster => cluster === value) ?? null;

  useEffect(() => {
    if (isLoadingClusters) {
      return;
    }

    setValue(selectedCluster);
  }, [isLoadingClusters, selectedCluster, setValue]);

  const handleChange = (newValue: string | string[] | null) => {
    const item = Array.isArray(newValue) ? newValue[0] : newValue;
    setValue(item);
  };

  useEffect(() => {
    if (onChange) {
      onChange(selectedCluster);
    }
  }, [selectedCluster, onChange]);

  const items = clusters.map(cluster => ({
    label: cluster,
    value: cluster,
  }));

  return (
    <Autocomplete
      label="Cluster"
      items={items}
      selectedValue={selectedCluster}
      onChange={handleChange}
      disabled={isLoadingClusters}
    />
  );
};
