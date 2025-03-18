import React, { useState } from 'react';
import { Box } from '@material-ui/core';
import { MultipleSelect } from '../UI/MultipleSelect';
import useDebounce from 'react-use/esm/useDebounce';

type InstallationsPickerProps = {
  installations: string[];
  selectedInstallations: string[];
  onChange?: (selectedInstallations: string[]) => void;
};

export const InstallationsPicker = ({
  installations,
  selectedInstallations,
  onChange,
}: InstallationsPickerProps) => {
  const [value, setValue] = useState(selectedInstallations);

  useDebounce(
    () => {
      if (
        onChange &&
        JSON.stringify(value.sort()) !==
          JSON.stringify(selectedInstallations.sort())
      ) {
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
        onChange={handleChange}
      />
    </Box>
  );
};
