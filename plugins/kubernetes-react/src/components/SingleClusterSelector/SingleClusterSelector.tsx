import { useEffect, useMemo, useState } from 'react';
import useLocalStorageState from 'use-local-storage-state';
import { Autocomplete } from '@giantswarm/backstage-plugin-ui-react';
import { useUrlState } from '../../hooks/useUrlState';
import { alertApiRef, useApi } from '@backstage/core-plugin-api';
import { useClusterQueries } from '../../hooks/useClusterQueries';

function useValue({
  persistToLocalStorage,
  persistToURL,
  urlParameterName,
}: {
  persistToLocalStorage: boolean;
  persistToURL: boolean;
  urlParameterName: string;
}) {
  const [valueFromState, setValueToState] = useState<string | null>(null);

  const [valueFromLocalStorage, setValueToLocalStorage] = useLocalStorageState<
    string | null
  >('gs-kubernetes-cluster', {
    defaultValue: null,
  });
  const { value: clusterParams, setValue: setValueToURL } = useUrlState(
    urlParameterName,
    { enabled: persistToURL },
  );
  const valueFromURL: string | null = clusterParams ? clusterParams[0] : null;

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

function useSelectedCluster({
  clusters,
  persistToLocalStorage,
  persistToURL,
  urlParameterName,
  disabled,
}: {
  clusters: string[];
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

  const selectedCluster = useMemo(() => {
    if (!value) {
      return null;
    }

    if (rejectedClusters.includes(value)) {
      return null;
    }

    return clusters.find(cluster => cluster === value) ?? null;
  }, [clusters, rejectedClusters, value]);

  useEffect(() => {
    if (disabled) {
      return;
    }

    if (selectedCluster !== value) {
      setValue(selectedCluster);
    }
  }, [disabled, selectedCluster, setValue, value]);

  return { selectedCluster, setSelectedCluster: setValue };
}

type ClusterSelectorProps = {
  label?: string;
  clusters?: string[];
  disabledClusters?: string[];
  isLoadingDisabledClusters?: boolean;
  disabled?: boolean;
  persistToLocalStorage?: boolean;
  persistToURL?: boolean;
  urlParameterName?: string;
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
  urlParameterName = 'cluster',
  onActiveClusterChange,
}: ClusterSelectorProps) => {
  const { selectedCluster, setSelectedCluster } = useSelectedCluster({
    clusters,
    persistToLocalStorage,
    persistToURL,
    urlParameterName,
    disabled,
  });

  const handleChange = (newValue: string | string[] | null) => {
    const newItem = Array.isArray(newValue) ? newValue[0] : newValue;
    setSelectedCluster(newItem);
  };

  const activeCluster = useMemo(() => {
    const selected = clusters.length === 1 ? clusters[0] : selectedCluster;

    if (!selected) {
      return null;
    }

    if (disabledClusters.includes(selected) && isLoadingDisabledClusters) {
      return null; // Selected cluster is potentially disabled, waiting for status check to complete
    }

    return disabledClusters.includes(selected) ? null : selected;
  }, [clusters, disabledClusters, isLoadingDisabledClusters, selectedCluster]);

  useEffect(() => {
    if (onActiveClusterChange) {
      onActiveClusterChange(activeCluster);
    }
  }, [activeCluster, onActiveClusterChange]);

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
      selectedValue={selectedCluster}
      onChange={handleChange}
      disabled={disabled}
    />
  );
};
