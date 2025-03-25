import React, { useMemo } from 'react';
import { AppVersionFilter } from '../filters';
import { ClusterData, useClustersData } from '../../../ClustersDataProvider';
import { MultiplePicker, MultiplePickerOption } from '../../../../UI';
import uniqBy from 'lodash/uniqBy';
import semver from 'semver';
import { ClusterColumns } from '../../../ClustersTable/columns';

const TITLE = 'App version';

function formatOption(item: ClusterData): MultiplePickerOption | undefined {
  if (!item.appVersion || item.appVersion === '') {
    return undefined;
  }

  const label = item.appVersion;
  const value = item.appVersion;

  return { value, label };
}

export const AppVersionPicker = () => {
  const {
    data,
    updateFilters,
    filters,
    visibleColumns,
    queryParameters: { appVersion: queryParameter },
  } = useClustersData();

  const options = useMemo(() => {
    const allOptions = data
      .map(item => formatOption(item))
      .filter(item => Boolean(item)) as MultiplePickerOption[];

    return uniqBy(allOptions, 'value').sort((itemA, itemB) => {
      return semver.compare(itemA.value, itemB.value);
    });
  }, [data]);

  const handleSelect = (selectedValues: string[]) => {
    updateFilters({
      appVersion: new AppVersionFilter(selectedValues),
    });
  };

  const hidden =
    visibleColumns.length > 0 &&
    !visibleColumns.includes(ClusterColumns.appVersion);

  return (
    <MultiplePicker
      label={TITLE}
      queryParameter={queryParameter}
      filterValue={filters.appVersion?.values}
      options={options}
      onSelect={handleSelect}
      hidden={hidden}
      autocomplete
    />
  );
};
