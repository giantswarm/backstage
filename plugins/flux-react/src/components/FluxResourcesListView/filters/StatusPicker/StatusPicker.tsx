import { useMemo } from 'react';
import { MultiplePicker } from '@giantswarm/backstage-plugin-ui-react';
import { useFluxResourcesData } from '../../../FluxResourcesDataProvider';
import { StatusFilter } from '../filters';
import {
  AggregatedStatus,
  getAggregatedStatus,
} from '../../../../utils/getAggregatedStatus';

const TITLE = 'Status';

export const StatusPicker = () => {
  const {
    data,
    updateFilters,
    filters,
    queryParameters: { status: queryParameter },
  } = useFluxResourcesData();

  const options = useMemo(() => {
    const statusCounts: Record<AggregatedStatus, number> = {
      ready: 0,
      'not-ready': 0,
      inactive: 0,
      unknown: 0,
    };

    data.forEach(item => {
      const aggregatedStatus = getAggregatedStatus(item.status);
      statusCounts[aggregatedStatus]++;
    });

    return [
      { value: 'ready', label: 'Ready', count: statusCounts.ready },
      {
        value: 'not-ready',
        label: 'Not Ready',
        count: statusCounts['not-ready'],
      },
      { value: 'inactive', label: 'Inactive', count: statusCounts.inactive },
      { value: 'unknown', label: 'Unknown', count: statusCounts.unknown },
    ];
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
