import { useMemo } from 'react';
import {
  MultiplePicker,
  MultiplePickerOption,
} from '@giantswarm/backstage-plugin-ui-react';
import { VersionFilter } from '../filters';
import {
  DeploymentData,
  useDeploymentsData,
} from '../../../DeploymentsDataProvider';
import uniqBy from 'lodash/uniqBy';
import semver from 'semver';

const TITLE = 'Version';

export function compareVersionOptions(
  itemA: MultiplePickerOption,
  itemB: MultiplePickerOption,
): number {
  const a = semver.valid(semver.coerce(itemA.value));
  const b = semver.valid(semver.coerce(itemB.value));
  if (a && b) return semver.compare(a, b);
  if (a) return -1;
  if (b) return 1;
  return itemA.value.localeCompare(itemB.value);
}

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

    return uniqBy(allOptions, 'value').sort(compareVersionOptions);
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
