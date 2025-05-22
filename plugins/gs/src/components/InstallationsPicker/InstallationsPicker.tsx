import { useEffect, useState } from 'react';
import { Box } from '@material-ui/core';
import { MultipleSelect } from '../UI/MultipleSelect';
import useDebounce from 'react-use/esm/useDebounce';
import { useLocation } from 'react-router-dom';
import qs from 'qs';
import isEqual from 'lodash/isEqual';

type InstallationsPickerProps = {
  installations: string[];
  selectedInstallations: string[];
  disabledInstallations: string[];
  onChange?: (selectedInstallations: string[]) => void;
};

export const InstallationsPicker = ({
  installations,
  selectedInstallations,
  disabledInstallations,
  onChange,
}: InstallationsPickerProps) => {
  const [value, setValue] = useState(selectedInstallations);

  const location = useLocation();
  useEffect(() => {
    const parsed = qs.parse(location.search, {
      ignoreQueryPrefix: true,
    });
    const queryParameter = (parsed.installations ?? []) as string[];
    const queryParameters = [queryParameter].flat().filter(Boolean) as string[];
    const resetValue =
      Array.isArray(queryParameter) && queryParameter[0] === '';

    if (resetValue || queryParameters.length > 0) {
      setValue(queryParameters);
    }
  }, [location.search]);

  useDebounce(
    () => {
      if (onChange && !isEqual(value, selectedInstallations)) {
        onChange(value);
      }
    },
    10,
    [value],
  );

  const handleChange = (newValue: string[]) => {
    setValue(newValue);
  };

  const items = installations.map(installation => ({
    label: installation,
    value: installation,
  }));

  return (
    <Box pb={1} pt={1}>
      <MultipleSelect
        label="Installations"
        items={items}
        selected={selectedInstallations}
        disabledItems={disabledInstallations}
        onChange={handleChange}
      />
    </Box>
  );
};
