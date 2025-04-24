import { useMemo } from 'react';
import { KubernetesVersionFilter } from '../filters';
import { ClusterData, useClustersData } from '../../../ClustersDataProvider';
import { MultiplePicker, MultiplePickerOption } from '../../../../UI';
import uniqBy from 'lodash/uniqBy';
import semver from 'semver';
import { ClusterColumns } from '../../../ClustersTable/columns';

const TITLE = 'Kubernetes version';

function formatOption(item: ClusterData): MultiplePickerOption | undefined {
  if (!item.kubernetesVersion || item.kubernetesVersion === '') {
    return undefined;
  }

  const label = item.kubernetesVersion;
  const value = item.kubernetesVersion;

  return { value, label };
}

export const KubernetesVersionPicker = () => {
  const {
    data,
    updateFilters,
    filters,
    visibleColumns,
    queryParameters: { kubernetesVersion: queryParameter },
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
      kubernetesVersion: new KubernetesVersionFilter(selectedValues),
    });
  };

  const hidden =
    visibleColumns.length > 0 &&
    !visibleColumns.includes(ClusterColumns.kubernetesVersion);

  return (
    <MultiplePicker
      label={TITLE}
      queryParameter={queryParameter}
      filterValue={filters.kubernetesVersion?.values}
      options={options}
      onSelect={handleSelect}
      hidden={hidden}
      autocomplete
    />
  );
};
