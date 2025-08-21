import { useMemo } from 'react';
import {
  MultiplePicker,
  MultiplePickerOption,
} from '@giantswarm/backstage-plugin-ui-react';
import { OrganizationFilter } from '../filters';
import { ClusterData, useClustersData } from '../../../ClustersDataProvider';
import uniqBy from 'lodash/uniqBy';

const TITLE = 'Organizations';

function formatOption(item: ClusterData): MultiplePickerOption | undefined {
  if (!item.organization) {
    return undefined;
  }

  const label = item.organization;
  const value = item.organization;

  return { value, label };
}

export const OrganizationPicker = () => {
  const {
    data,
    updateFilters,
    filters,
    queryParameters: { organization: queryParameter },
  } = useClustersData();

  const options = useMemo(() => {
    const allOptions = data
      .map(item => formatOption(item))
      .filter(item => Boolean(item)) as MultiplePickerOption[];

    return uniqBy(allOptions, 'value');
  }, [data]);

  const handleSelect = (selectedValues: string[]) => {
    updateFilters({
      organization: new OrganizationFilter(selectedValues),
    });
  };

  return (
    <MultiplePicker
      label={TITLE}
      queryParameter={queryParameter}
      filterValue={filters.organization?.values}
      options={options}
      onSelect={handleSelect}
      autocomplete
    />
  );
};
