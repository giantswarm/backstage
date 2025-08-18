import { useEffect, useMemo, useState } from 'react';
import useLocalStorageState from 'use-local-storage-state';
import { Autocomplete } from '@giantswarm/backstage-plugin-ui-react';
import { useUrlState } from '../../hooks/useUrlState';

function useValue({
  persistToLocalStorage,
  persistToURL,
  urlParameterName,
}: {
  persistToLocalStorage: boolean;
  persistToURL: boolean;
  urlParameterName: string;
}) {
  const [valueFromState, setValueToState] = useState<string[]>([]);

  const [valueFromLocalStorage, setValueToLocalStorage] = useLocalStorageState<
    string[]
  >('gs-kubernetes-clusters', {
    defaultValue: [],
  });
  const { value: valueFromURL, setValue: setValueToURL } = useUrlState(
    urlParameterName,
    { multiple: true, enabled: persistToURL },
  );

  let value = valueFromState;
  if (persistToLocalStorage && valueFromLocalStorage) {
    value = valueFromLocalStorage;
  }
  if (persistToURL && valueFromURL) {
    value = valueFromURL;
  }

  const setValue = (newValue: string[]) => {
    const newValueHash = JSON.stringify(newValue.sort());
    const valueFromStateHash = JSON.stringify(valueFromState.sort());
    const valueFromLocalStorageHash = JSON.stringify(
      valueFromLocalStorage.sort(),
    );
    const valueFromURLHash = JSON.stringify(valueFromURL.sort());

    if (newValueHash !== valueFromStateHash) {
      setValueToState(newValue);
    }
    if (persistToLocalStorage && newValueHash !== valueFromLocalStorageHash) {
      setValueToLocalStorage(newValue);
    }
    if (persistToURL && newValueHash !== valueFromURLHash) {
      setValueToURL(newValue);
    }
  };

  return { value, setValue };
}

type MultipleClustersSelectorProps = {
  label?: string;
  clusters?: string[];
  disabledClusters?: string[];
  isLoadingDisabledClusters?: boolean;
  disabled?: boolean;
  persistToLocalStorage?: boolean;
  persistToURL?: boolean;
  urlParameterName?: string;
  onActiveClustersChange?: (selectedClusters: string[]) => void;
};

export const MultipleClustersSelector = ({
  label = 'Clusters',
  clusters = [],
  disabledClusters = [],
  isLoadingDisabledClusters = false,
  disabled = false,
  persistToLocalStorage = true,
  persistToURL = true,
  urlParameterName = 'clusters',
  onActiveClustersChange,
}: MultipleClustersSelectorProps) => {
  const { value, setValue } = useValue({
    persistToLocalStorage,
    persistToURL,
    urlParameterName,
  });

  const selectedClusters = useMemo(() => {
    return clusters.filter(cluster => value.includes(cluster));
  }, [clusters, value]);

  useEffect(() => {
    if (disabled) {
      return;
    }

    setValue(selectedClusters);
  }, [disabled, selectedClusters, setValue]);

  const handleChange = (newValue: string | string[] | null) => {
    const newItems = [newValue].flat().filter(Boolean) as string[];
    setValue(newItems);
  };

  const activeClusters = useMemo(() => {
    const allSelectedClusters =
      clusters.length === 1 || selectedClusters.length === 0
        ? clusters
        : selectedClusters;

    if (
      allSelectedClusters.some(cluster => disabledClusters.includes(cluster)) &&
      isLoadingDisabledClusters
    ) {
      return []; // Some selected clusters are potentially disabled, waiting for status check to complete
    }

    return allSelectedClusters.filter(
      cluster => !disabledClusters.includes(cluster),
    );
  }, [clusters, disabledClusters, isLoadingDisabledClusters, selectedClusters]);

  useEffect(() => {
    if (onActiveClustersChange) {
      onActiveClustersChange(activeClusters);
    }
  }, [activeClusters, onActiveClustersChange]);

  const items = clusters.map(cluster => ({
    label: cluster,
    value: cluster,
  }));

  return (
    <Autocomplete
      label={label}
      items={items}
      disabledItems={disabledClusters}
      selectedValue={selectedClusters}
      onChange={handleChange}
      disabled={disabled}
      multiple
    />
  );
};
