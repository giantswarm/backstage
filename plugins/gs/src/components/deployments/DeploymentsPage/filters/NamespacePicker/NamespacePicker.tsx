import React, { useMemo } from 'react';
import { NamespaceFilter } from '../filters';
import {
  DeploymentData,
  useDeploymentsData,
} from '../../../DeploymentsDataProvider';
import { MultiplePicker, MultiplePickerOption } from '../../../../UI';
import uniqBy from 'lodash/uniqBy';

const TITLE = 'Namespace';

function formatOption(item: DeploymentData): MultiplePickerOption | undefined {
  if (!item.namespace) {
    return undefined;
  }

  const label = item.namespace;
  const value = item.namespace;

  return { value, label };
}

export const NamespacePicker = () => {
  const {
    data,
    updateFilters,
    filters,
    queryParameters: { namespace: queryParameter },
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
      namespace: new NamespaceFilter(selectedValues),
    });
  };

  return (
    <MultiplePicker
      label={TITLE}
      queryParameter={queryParameter}
      filterValue={filters.namespace?.values}
      options={options}
      onSelect={handleSelect}
      autocomplete
    />
  );
};
