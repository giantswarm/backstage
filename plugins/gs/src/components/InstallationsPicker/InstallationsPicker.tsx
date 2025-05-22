import { useEffect, useState } from 'react';
import useDebounce from 'react-use/esm/useDebounce';
import { useLocation } from 'react-router-dom';
import qs from 'qs';
import isEqual from 'lodash/isEqual';
import { Autocomplete } from '../UI';

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
    <Autocomplete
      label="Installations"
      items={items}
      selectedValues={selectedInstallations}
      disabledItems={disabledInstallations}
      onChange={handleChange}
    />
  );
};
