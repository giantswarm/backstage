import React, { useMemo } from 'react';
import uniqBy from 'lodash/uniqBy';
import {
  DeploymentData,
  useDeploymentsData,
} from '../../../DeploymentsDataProvider';
import { MultiplePicker, MultiplePickerOption } from '../../../../UI';
import { ClusterTypes } from '../../../../clusters/utils';
import { TargetClusterKindFilter } from '../filters';

export const MC_VALUE = 'mc';
export const WC_VALUE = 'wc';

const MC_LABEL = 'Management Cluster';
const WC_LABEL = 'Workload Cluster';

const TITLE = 'Cluster Type';

function formatOption(item: DeploymentData): MultiplePickerOption | undefined {
  if (!item.clusterType) {
    return undefined;
  }

  let value = WC_VALUE;
  let label = WC_LABEL;
  if (item.clusterType === ClusterTypes.Management) {
    value = MC_VALUE;
    label = MC_LABEL;
  }

  return { value, label };
}

export const TargetClusterKindPicker = () => {
  const {
    data,
    filters,
    queryParameters: { targetClusterKind: queryParameter },
    updateFilters,
  } = useDeploymentsData();

  const options = useMemo(() => {
    const allOptions = data
      .map(item => formatOption(item))
      .filter(item => Boolean(item)) as MultiplePickerOption[];

    return uniqBy(allOptions, 'value');
  }, [data]);

  const handleSelect = (selectedValues: string[]) => {
    updateFilters({
      targetClusterKind: new TargetClusterKindFilter(selectedValues),
    });
  };

  return (
    <MultiplePicker
      label={TITLE}
      queryParameter={queryParameter}
      filterValue={filters.targetClusterKind?.values}
      options={options}
      onSelect={handleSelect}
    />
  );
};
