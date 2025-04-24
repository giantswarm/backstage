import { useMemo } from 'react';
import { StatusFilter } from '../filters';
import { ClusterData, useClustersData } from '../../../ClustersDataProvider';
import { MultiplePicker, MultiplePickerOption } from '../../../../UI';
import uniqBy from 'lodash/uniqBy';
import { toSentenceCase } from '../../../../utils/helpers';

const TITLE = 'Status';

function formatOption(item: ClusterData): MultiplePickerOption | undefined {
  const label = toSentenceCase(item.status);
  const value = item.status;

  return { value, label };
}

export const StatusPicker = () => {
  const {
    data,
    updateFilters,
    filters,
    queryParameters: { status: queryParameter },
  } = useClustersData();

  const options = useMemo(() => {
    const allOptions = data
      .map(item => formatOption(item))
      .filter(item => Boolean(item)) as MultiplePickerOption[];

    return uniqBy(allOptions, 'value').sort((itemA, itemB) => {
      return itemA.label.localeCompare(itemB.label);
    });
  }, [data]);

  const handleSelect = (selectedValues: string[]) => {
    updateFilters({
      status: new StatusFilter(selectedValues),
    });
  };

  return (
    <MultiplePicker
      label={TITLE}
      queryParameter={queryParameter}
      filterValue={filters.status?.values}
      options={options}
      onSelect={handleSelect}
      autocomplete
    />
  );
};
