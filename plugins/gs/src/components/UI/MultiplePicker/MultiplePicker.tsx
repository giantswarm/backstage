import Box from '@material-ui/core/Box';
import React, { useEffect, useMemo, useState } from 'react';
import { MultipleSelect } from '../MultipleSelect';
import { Autocomplete } from '../Autocomplete';

export type Option = {
  value: string;
  label: string;
};

export type MultiplePickerProps = {
  label: string;
  queryParameter: string | string[];
  options: Option[];
  onSelect?: (value: string[]) => void;
  filterValue?: string[];
  autocomplete?: boolean;
  disabled?: boolean;
};

export function MultiplePicker(props: MultiplePickerProps) {
  const {
    label,
    queryParameter,
    filterValue = [],
    options,
    onSelect,
    autocomplete = false,
  } = props;

  const queryParameters = useMemo(
    () => [queryParameter].flat().filter(Boolean) as string[],
    [queryParameter],
  );

  const [values, setValues] = useState(
    queryParameters.length ? queryParameters : filterValue,
  );

  useEffect(() => {
    if (queryParameters.length) {
      setValues(queryParameters);
    }
  }, [queryParameters]);

  useEffect(() => {
    if (filterValue.length) {
      setValues(filterValue);
    }
  }, [filterValue]);

  useEffect(() => {
    if (onSelect) {
      onSelect(values);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Don't trigger on onSelect reference change
  }, [values]);

  return (
    <Box pb={1} pt={1}>
      {autocomplete ? (
        <Autocomplete
          label={label}
          items={options}
          selectedValues={values}
          onChange={selectedValues => setValues(selectedValues)}
        />
      ) : (
        <MultipleSelect
          label={label}
          items={options}
          selected={values}
          onChange={selectedValues => setValues(selectedValues)}
        />
      )}
    </Box>
  );
}
