import { useMemo } from 'react';
// import uniqBy from 'lodash/uniqBy';
import {
  FluxResourceData,
  useFluxResourcesData,
} from '../../../FluxResourcesDataProvider';
import {
  FluxStatusFilter,
  getAggregatedStatus,
} from '../../../FluxResourcesDataProvider/utils';

const TITLE = 'Status';

const STATUS_LABELS = {
  ready: 'Ready',
  'not-ready': 'Not Ready',
  inactive: 'Inactive',
};

// function formatOption(
//   item: FluxResourceData,
// ): MultiplePickerOption | undefined {
//   const aggregatedStatus = getAggregatedStatus(item);
//   const label =
//     STATUS_LABELS[aggregatedStatus as keyof typeof STATUS_LABELS] ||
//     aggregatedStatus;
//   const value = aggregatedStatus;

//   return { value, label };
// }

export const StatusPicker = () => {
  // const {
  //   data,
  //   updateFilters,
  //   filters,
  //   queryParameters: { status: queryParameter },
  // } = useFluxResourcesData();
  // const options = useMemo(() => {
  //   const allOptions = data
  //     .map(item => formatOption(item))
  //     .filter(item => Boolean(item)) as MultiplePickerOption[];
  //   return uniqBy(allOptions, 'value').sort((itemA, itemB) => {
  //     return itemA.label.localeCompare(itemB.label);
  //   });
  // }, [data]);
  // const handleSelect = (selectedValues: string[]) => {
  //   updateFilters({
  //     status: new FluxStatusFilter(selectedValues),
  //   });
  // };
  // return (
  //   <MultiplePicker
  //     label={TITLE}
  //     queryParameter={queryParameter}
  //     filterValue={filters.status?.values}
  //     options={options}
  //     onSelect={handleSelect}
  //     autocomplete
  //   />
  // );
};
