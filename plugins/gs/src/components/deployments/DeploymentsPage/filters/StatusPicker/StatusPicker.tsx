import { useMemo } from 'react';
import { StatusFilter } from '../filters';
import {
  DeploymentData,
  useDeploymentsData,
} from '../../../DeploymentsDataProvider';
import { MultiplePicker, MultiplePickerOption } from '../../../../UI';
import uniqBy from 'lodash/uniqBy';
import { toSentenceCase } from '../../../../utils/helpers';

const TITLE = 'Status';

function formatOption(item: DeploymentData): MultiplePickerOption | undefined {
  if (!item.status) {
    return undefined;
  }

  const label = toSentenceCase(item.status.replace(/-/g, ' '));
  const value = item.status;

  return { value, label };
}

export const StatusPicker = () => {
  const {
    data,
    updateFilters,
    filters,
    queryParameters: { status: queryParameter },
  } = useDeploymentsData();

  const options = useMemo(() => {
    const allOptions = data
      .map(item => formatOption(item))
      .filter(item => Boolean(item)) as MultiplePickerOption[];

    return uniqBy(allOptions, 'value').sort((itemA, itemB) => {
      return itemA.label.localeCompare(itemB.label);
    });
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
