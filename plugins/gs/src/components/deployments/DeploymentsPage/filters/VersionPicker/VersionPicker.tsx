import React, { useMemo } from 'react';
import { VersionFilter } from '../filters';
import {
  DeploymentData,
  useDeploymentsData,
} from '../../../DeploymentsDataProvider';
import { MultiplePicker, MultiplePickerOption } from '../../../../UI';
import uniqBy from 'lodash/uniqBy';
import semver from 'semver';

const TITLE = 'Version';

function formatOption(item: DeploymentData): MultiplePickerOption | undefined {
  if (item.version === '') {
    return undefined;
  }

  const label = item.version;
  const value = item.version;

  return { value, label };
}

export const VersionPicker = () => {
  const {
    data,
    updateFilters,
    filters,
    queryParameters: { version: queryParameter },
  } = useDeploymentsData();

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
      version: new VersionFilter(selectedValues),
    });
  };

  return (
    <MultiplePicker
      label={TITLE}
      queryParameter={queryParameter}
      filterValue={filters.version?.values}
      options={options}
      onSelect={handleSelect}
      autocomplete
    />
  );
};
