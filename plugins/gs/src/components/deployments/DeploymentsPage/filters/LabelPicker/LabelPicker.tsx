import React, { useCallback, useMemo } from 'react';
import { LabelFilter } from '../filters';
import {
  DeploymentData,
  useDeploymentsData,
} from '../../../DeploymentsDataProvider';
import { MultiplePicker, MultiplePickerOption } from '../../../../UI';
import uniqBy from 'lodash/uniqBy';
import { Typography } from '@material-ui/core';

const TITLE = 'Label';

function formatOptions(
  item: DeploymentData,
): MultiplePickerOption[] | undefined {
  if (!item.labels) {
    return undefined;
  }

  return item.labels.map(label => {
    return { value: label, label: label };
  });
}

export const LabelPicker = () => {
  const {
    data,
    updateFilters,
    filters,
    queryParameters: { label: queryParameter },
  } = useDeploymentsData();

  const options = useMemo(() => {
    const allOptions = data
      .flatMap(item => formatOptions(item))
      .filter(item => Boolean(item)) as MultiplePickerOption[];

    return uniqBy(allOptions, 'value').sort((itemA, itemB) => {
      return itemA.label.localeCompare(itemB.label);
    });
  }, [data]);

  const handleSelect = useCallback(
    (selectedValues: string[]) => {
      updateFilters({
        label: new LabelFilter(selectedValues),
      });
    },
    [updateFilters],
  );

  const renderLabel = useCallback((label: string) => {
    const parts = label.split(': ');
    return parts.length === 2 ? (
      <>
        <Typography variant="subtitle2" component="span">
          {parts[0]}:
        </Typography>{' '}
        {parts[1]}
      </>
    ) : (
      <Typography variant="subtitle2" component="span">
        {parts[0]}
      </Typography>
    );
  }, []);

  return (
    <MultiplePicker
      label={TITLE}
      queryParameter={queryParameter}
      filterValue={filters.label?.values}
      options={options}
      onSelect={handleSelect}
      renderLabel={renderLabel}
      autocomplete
    />
  );
};
