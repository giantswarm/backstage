import { useMemo } from 'react';
import uniqBy from 'lodash/uniqBy';
import {
  MultiplePicker,
  MultiplePickerOption,
} from '@giantswarm/backstage-plugin-ui-react';
import {
  FluxResourceData,
  useFluxResourcesData,
} from '../../../FluxResourcesDataProvider';
import { StatusFilter } from '../filters';
import {
  AggregatedStatus,
  getAggregatedStatus,
} from '../../../../utils/getAggregatedStatus';

const TITLE = 'Status';

function formatOption(
  item: FluxResourceData,
): MultiplePickerOption | undefined {
  const aggregatedStatus = getAggregatedStatus(item.status);

  const statusLabels: Record<AggregatedStatus, string> = {
    ready: 'Ready',
    'not-ready': 'Not Ready',
    inactive: 'Inactive',
    unknown: 'Unknown',
  };

  const label = statusLabels[aggregatedStatus];
  const value = aggregatedStatus;

  return { value, label };
}

export const StatusPicker = () => {
  const {
    data,
    updateFilters,
    filters,
    queryParameters: { status: queryParameter },
  } = useFluxResourcesData();

  const options = useMemo(() => {
    const allOptions = data
      .map(item => formatOption(item))
      .filter(item => Boolean(item)) as MultiplePickerOption[];

    return uniqBy(allOptions, 'value');
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
