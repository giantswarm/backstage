import { useMemo } from 'react';
import { AppFilter } from '../filters';
import {
  DeploymentData,
  useDeploymentsData,
} from '../../../DeploymentsDataProvider';
import { MultiplePicker, MultiplePickerOption } from '../../../../UI';
import uniqBy from 'lodash/uniqBy';

const TITLE = 'App';

function formatOption(item: DeploymentData): MultiplePickerOption | undefined {
  if (!item.app) {
    return undefined;
  }

  const label = item.app;
  const value = item.app;

  return { value, label };
}

export const AppPicker = () => {
  const {
    data,
    updateFilters,
    filters,
    queryParameters: { app: queryParameter },
  } = useDeploymentsData();

  const options = useMemo(() => {
    const allOptions = data
      .map(item => formatOption(item))
      .filter(item => Boolean(item)) as MultiplePickerOption[];

    return uniqBy(allOptions, 'value').sort((a, b) =>
      a.label.localeCompare(b.label),
    );
  }, [data]);

  const handleSelect = (selectedValues: string[]) => {
    updateFilters({
      app: new AppFilter(selectedValues),
    });
  };

  return (
    <MultiplePicker
      label={TITLE}
      queryParameter={queryParameter}
      filterValue={filters.app?.values}
      options={options}
      onSelect={handleSelect}
      autocomplete
    />
  );
};
