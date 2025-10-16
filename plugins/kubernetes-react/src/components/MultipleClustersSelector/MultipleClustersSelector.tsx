import { useEffect, useMemo, useState } from 'react';
import useLocalStorageState from 'use-local-storage-state';
import { Autocomplete } from '@giantswarm/backstage-plugin-ui-react';
import { useUrlState } from '../../hooks/useUrlState';
import { useClusterQueries } from '../../hooks/useClusterQueries';
import { alertApiRef, useApi } from '@backstage/core-plugin-api';

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

  const fallbackLocalStorageValueStr = localStorage.getItem('gs-installations');
  const fallbackLocalStorageValue = fallbackLocalStorageValueStr
    ? JSON.parse(fallbackLocalStorageValueStr)
    : undefined;

  const [valueFromLocalStorage, setValueToLocalStorage] = useLocalStorageState<
    string[]
  >('gs-kubernetes-clusters', {
    defaultValue: fallbackLocalStorageValue ?? [],
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
    const valueFromURLHash = JSON.stringify(
      valueFromURL ? valueFromURL.sort() : valueFromURL,
    );

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

function useSelectedClusters({
  clusters,
  disabledClusters,
  persistToLocalStorage,
  persistToURL,
  urlParameterName,
  disabled,
}: {
  clusters: string[];
  disabledClusters: string[];
  persistToLocalStorage: boolean;
  persistToURL: boolean;
  urlParameterName: string;
  disabled: boolean;
}) {
  const { value, setValue } = useValue({
    persistToLocalStorage,
    persistToURL,
    urlParameterName,
  });

  const alertApi = useApi(alertApiRef);
  const { clusterStatuses } = useClusterQueries();
  const rejectedClusters = useMemo(() => {
    const errors = clusterStatuses.flatMap(
      clusterStatus => clusterStatus.errors,
    );
    const rejectedItems = errors
      .filter(({ error }) => error.name === 'RejectedError')
      .map(({ cluster }) => cluster);

    return [...new Set(rejectedItems)];
  }, [clusterStatuses]);

  useEffect(() => {
    if (rejectedClusters.length > 0) {
      const clusterNames =
        rejectedClusters.length === 1
          ? rejectedClusters[0]
          : `${rejectedClusters.slice(0, -1).join(', ')} and ${rejectedClusters[rejectedClusters.length - 1]}`;
      const message = `${rejectedClusters.length === 1 ? 'Cluster' : 'Clusters'} ${clusterNames} ${rejectedClusters.length === 1 ? 'has' : 'have'} been deselected since authentication was rejected.`;

      alertApi.post({
        message,
        severity: 'error',
        display: 'transient',
      });
    }
  }, [rejectedClusters, alertApi]);

  const selectedClusters = useMemo(() => {
    let selected = value;
    if (value.length === 0 && rejectedClusters.length > 0) {
      selected = clusters
        .filter(cluster => !disabledClusters.includes(cluster))
        .filter(cluster => !rejectedClusters.includes(cluster));
    }

    return clusters
      .filter(cluster => !rejectedClusters.includes(cluster))
      .filter(cluster => selected.includes(cluster));
  }, [clusters, disabledClusters, rejectedClusters, value]);

  useEffect(() => {
    if (disabled) {
      return;
    }

    setValue(selectedClusters);
  }, [disabled, selectedClusters, setValue]);

  return { selectedClusters, setSelectedClusters: setValue };
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
  const { selectedClusters, setSelectedClusters } = useSelectedClusters({
    clusters,
    disabledClusters,
    persistToLocalStorage,
    persistToURL,
    urlParameterName,
    disabled,
  });

  const handleChange = (newValue: string | string[] | null) => {
    const newItems = [newValue].flat().filter(Boolean) as string[];
    setSelectedClusters(newItems);
  };

  const activeClusters = useMemo(() => {
    const selected =
      clusters.length === 1 || selectedClusters.length === 0
        ? clusters
        : selectedClusters;

    if (
      selected.some(cluster => disabledClusters.includes(cluster)) &&
      isLoadingDisabledClusters
    ) {
      return []; // Some selected clusters are potentially disabled, waiting for status check to complete
    }

    return selected.filter(cluster => !disabledClusters.includes(cluster));
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

  if (clusters.length <= 1) {
    return null;
  }

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
