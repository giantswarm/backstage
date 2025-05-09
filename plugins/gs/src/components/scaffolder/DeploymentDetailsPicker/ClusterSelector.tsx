import { useMemo } from 'react';

import {
  Cluster,
  getClusterName,
  isManagementCluster,
} from '@giantswarm/backstage-plugin-gs-common';
import { SelectFormField } from '../../UI/SelectFormField';
import { useClusters } from '../../hooks';

type ClusterSelectorProps = {
  id?: string;
  label?: string;
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
  error?: boolean;
  installations: string[];
  selectedCluster?: string;
  onChange: (cluster: Cluster) => void;
};

export const ClusterSelector = ({
  id,
  label,
  helperText,
  required,
  disabled,
  error,
  installations,
  selectedCluster,
  onChange,
}: ClusterSelectorProps) => {
  const { resources, isLoading } = useClusters(installations);

  const clusterResourcesMap = useMemo(() => {
    const clusterResources = resources.filter(
      ({ installationName, ...cluster }) =>
        !isManagementCluster(cluster, installationName),
    );

    return Object.fromEntries(
      clusterResources.map(resource => {
        const { installationName, ...cluster } = resource;

        return [getClusterName(cluster), resource];
      }),
    );
  }, [resources]);
  const clusterNames = Object.keys(clusterResourcesMap);

  const isDisabled = disabled || installations.length === 0 || isLoading;

  const handleChange = (selectedItem: string) => {
    const { installationName, ...cluster } = clusterResourcesMap[selectedItem];

    onChange(cluster);
  };

  return (
    <SelectFormField
      id={id}
      label={label}
      helperText={isLoading ? 'Loading list of clusters...' : helperText}
      required={required}
      disabled={isDisabled}
      error={error}
      items={clusterNames}
      selectedItem={selectedCluster ?? ''}
      onChange={handleChange}
    />
  );
};
