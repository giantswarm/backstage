import { useMemo } from 'react';
import { TargetClusterFilter } from '../filters';
import {
  DeploymentData,
  useDeploymentsData,
} from '../../../DeploymentsDataProvider';
import { MultiplePicker, MultiplePickerOption } from '../../../../UI';
import uniqBy from 'lodash/uniqBy';

const TITLE = 'Clusters';

function formatOptionLabel(installationName: string, clusterName: string) {
  return installationName === clusterName
    ? clusterName
    : `${installationName}/${clusterName}`;
}

function formatOptionValue(installationName: string, clusterName: string) {
  return `${installationName}/${clusterName}`;
}

function formatOption(item: DeploymentData): MultiplePickerOption | undefined {
  const installationName = item.installationName;
  const clusterName = item.clusterName;

  if (!clusterName) {
    return undefined;
  }

  const label = formatOptionLabel(installationName, clusterName);
  const value = formatOptionValue(installationName, clusterName);

  return { value, label };
}

export const TargetClusterPicker = () => {
  const {
    data,
    updateFilters,
    filters,
    queryParameters: { targetCluster: queryParameter },
  } = useDeploymentsData();

  const options = useMemo(() => {
    const allOptions = data
      .map(item => formatOption(item))
      .filter(item => Boolean(item)) as MultiplePickerOption[];

    return uniqBy(allOptions, 'value');
  }, [data]);

  const handleSelect = (selectedValues: string[]) => {
    updateFilters({
      targetCluster: new TargetClusterFilter(selectedValues),
    });
  };

  return (
    <MultiplePicker
      label={TITLE}
      queryParameter={queryParameter}
      filterValue={filters.targetCluster?.values}
      options={options}
      onSelect={handleSelect}
      autocomplete
    />
  );
};
