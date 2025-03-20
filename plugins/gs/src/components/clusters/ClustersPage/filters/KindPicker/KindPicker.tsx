import React, { useMemo } from 'react';
import uniqBy from 'lodash/uniqBy';
import { ClusterData, useClustersData } from '../../../ClustersDataProvider';
import { KindFilter } from '../filters';
import { ClusterTypes } from '../../../utils';
import { MultiplePicker, MultiplePickerOption } from '../../../../UI';

export const MC_VALUE = 'mc';
export const WC_VALUE = 'wc';

const MC_LABEL = 'Management Cluster';
const WC_LABEL = 'Workload Cluster';

const TITLE = 'Type';

function formatOption(item: ClusterData): MultiplePickerOption | undefined {
  let value = WC_VALUE;
  let label = WC_LABEL;
  if (item.type === ClusterTypes.Management) {
    value = MC_VALUE;
    label = MC_LABEL;
  }

  return { value, label };
}

export const KindPicker = () => {
  const {
    data,
    filters,
    queryParameters: { kind: queryParameter },
    updateFilters,
  } = useClustersData();

  const options = useMemo(() => {
    const allOptions = data
      .map(item => formatOption(item))
      .filter(item => Boolean(item)) as MultiplePickerOption[];

    return uniqBy(allOptions, 'value');
  }, [data]);

  const handleSelect = (selectedValues: string[]) => {
    updateFilters({
      kind: new KindFilter(selectedValues),
    });
  };

  return (
    <MultiplePicker
      label={TITLE}
      queryParameter={queryParameter}
      filterValue={filters.kind?.values}
      options={options}
      onSelect={handleSelect}
    />
  );
};
