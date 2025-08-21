import { useMemo } from 'react';
import uniqBy from 'lodash/uniqBy';
import {
  MultiplePicker,
  MultiplePickerOption,
} from '@giantswarm/backstage-plugin-ui-react';
import { ClusterData, useClustersData } from '../../../ClustersDataProvider';
import { LocationFilter } from '../filters';
import { ClusterColumns } from '../../../ClustersTable/columns';

const TITLE = 'Region';

function formatOption(item: ClusterData): MultiplePickerOption | undefined {
  if (!item.location) {
    return undefined;
  }

  const value = item.location;
  const label = item.location;

  return { value, label };
}

export const LocationPicker = () => {
  const {
    data,
    filters,
    queryParameters: { location: queryParameter },
    visibleColumns,
    updateFilters,
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
      location: new LocationFilter(selectedValues),
    });
  };

  const hidden =
    visibleColumns.length > 0 &&
    !visibleColumns.includes(ClusterColumns.location);

  return (
    <MultiplePicker
      label={TITLE}
      queryParameter={queryParameter}
      filterValue={filters.location?.values}
      options={options}
      hidden={hidden}
      onSelect={handleSelect}
    />
  );
};
