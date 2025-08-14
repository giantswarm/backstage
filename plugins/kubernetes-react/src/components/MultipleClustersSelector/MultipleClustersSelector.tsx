import { useEffect, useMemo, useState } from 'react';
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
  const [valueFromState, setValueToState] = useState<string[]>([]);

  const [valueFromLocalStorage, setValueToLocalStorage] = useLocalStorageState<
    string[]
  >('gs-kubernetes-clusters', {
    defaultValue: [],
  });
  const { value: valueFromURL, setValue: setValueToURL } = useUrlState(
    'clusters',
    { multiple: true },
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
  persistToLocalStorage?: boolean;
  persistToURL?: boolean;
  onChange?: (selectedClusters: string[]) => void;
};

export const MultipleClustersSelector = ({
  persistToLocalStorage = true,
  persistToURL = true,
  onChange,
}: MultipleClustersSelectorProps) => {
  const { clusters, isLoadingClusters, disabledClusters } = useClustersInfo();

  const { value, setValue } = useValue({
    persistToLocalStorage,
    persistToURL,
  });

  const selectedClusters = useMemo(
    () => clusters.filter(cluster => value.includes(cluster)),
    [clusters, value],
  );

  useEffect(() => {
    if (isLoadingClusters) {
      return;
    }

    setValue(selectedClusters);
  }, [isLoadingClusters, selectedClusters, setValue]);

  const handleChange = (newValue: string | string[] | null) => {
    const newItems = [newValue].flat().filter(Boolean) as string[];
    setValue(newItems);
  };

  useEffect(() => {
    if (onChange) {
      onChange(selectedClusters);
    }
  }, [selectedClusters, onChange]);

  const items = clusters.map(cluster => ({
    label: cluster,
    value: cluster,
  }));

  return (
    <Autocomplete
      label="Clusters"
      items={items}
      disabledItems={disabledClusters}
      selectedValue={selectedClusters}
      onChange={handleChange}
      disabled={isLoadingClusters}
      multiple
    />
  );
};
