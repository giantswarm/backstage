import { useEffect, useState } from 'react';
import useLocalStorageState from 'use-local-storage-state';
import { Autocomplete } from '@giantswarm/backstage-plugin-ui-react';
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
  const { value: clusterParams, setValue: setValueToURL } = useUrlState(
    'cluster',
    { enabled: persistToURL },
  );
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
  label?: string;
  clusters?: string[];
  disabledClusters?: string[];
  isLoadingDisabledClusters?: boolean;
  disabled?: boolean;
  persistToLocalStorage?: boolean;
  persistToURL?: boolean;
  onActiveClusterChange?: (selectedCluster: string | null) => void;
};

export const SingleClusterSelector = ({
  label = 'Cluster',
  clusters = [],
  disabledClusters = [],
  isLoadingDisabledClusters = false,
  disabled = false,
  persistToLocalStorage = true,
  persistToURL = true,
  onActiveClusterChange,
}: ClusterSelectorProps) => {
  const { value, setValue } = useValue({
    persistToLocalStorage,
    persistToURL,
  });

  const selectedCluster = clusters.find(cluster => cluster === value) ?? null;

  useEffect(() => {
    if (disabled) {
      return;
    }

    setValue(selectedCluster);
  }, [disabled, selectedCluster, setValue]);

  const handleChange = (newValue: string | string[] | null) => {
    const newItem = Array.isArray(newValue) ? newValue[0] : newValue;
    setValue(newItem);
  };

  const activeCluster =
    isLoadingDisabledClusters ||
    (selectedCluster && disabledClusters.includes(selectedCluster))
      ? null
      : selectedCluster;

  useEffect(() => {
    if (onActiveClusterChange) {
      onActiveClusterChange(activeCluster);
    }
  }, [activeCluster, onActiveClusterChange]);

  const items = clusters.map(cluster => ({
    label: cluster,
    value: cluster,
  }));

  return (
    <Autocomplete
      label={label}
      items={items}
      disabledItems={disabledClusters}
      selectedValue={selectedCluster}
      onChange={handleChange}
      disabled={disabled}
    />
  );
};
