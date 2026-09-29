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
import { Version } from '@giantswarm/semver-ts';

const TITLE = 'Version';

/** Reads the version a value starts with, e.g. `2.2.0` from `2.2.0_fa483d226565`. */
function parseLeadingVersion(value: string): Version | null {
  const leading = value.match(/^v?\d+(\.\d+){0,2}/)?.[0];
  return leading ? Version.tryParse(leading) : null;
}

export function compareVersionOptions(
  itemA: MultiplePickerOption,
  itemB: MultiplePickerOption,
): number {
  const a = parseLeadingVersion(itemA.value);
  const b = parseLeadingVersion(itemB.value);
  if (a && b) return a.compare(b);
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
