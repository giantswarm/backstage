import { useMemo } from 'react';
import { ReleaseVersionFilter } from '../filters';
import { ClusterData, useClustersData } from '../../../ClustersDataProvider';
import { MultiplePicker, MultiplePickerOption } from '../../../../UI';
import uniqBy from 'lodash/uniqBy';
import semver from 'semver';

const TITLE = 'Release';

function formatOption(item: ClusterData): MultiplePickerOption | undefined {
  if (!item.releaseVersion || item.releaseVersion === '') {
    return undefined;
  }

  const label = item.releaseVersion;
  const value = item.releaseVersion;

  return { value, label };
}

export const ReleaseVersionPicker = () => {
  const {
    data,
    updateFilters,
    filters,
    queryParameters: { releaseVersion: queryParameter },
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
      releaseVersion: new ReleaseVersionFilter(selectedValues),
    });
  };

  return (
    <MultiplePicker
      label={TITLE}
      queryParameter={queryParameter}
      filterValue={filters.releaseVersion?.values}
      options={options}
      onSelect={handleSelect}
      autocomplete
    />
  );
};
