import React, { useCallback } from 'react';
import { Typography, makeStyles } from '@material-ui/core';
import classnames from 'classnames';
import type { InstallationStatus } from '../hooks/useInstallationsStatuses';
import { MultipleSelectFormField } from '../UI/MultipleSelectFormField';
import { SelectFormField } from '../UI/SelectFormField';

const useStyles = makeStyles(() => ({
  '@keyframes pulsateSlightly': {
    '0%': { opacity: '0.6' },
    '100%': { opacity: '0.8' },
  },
  isLoading: {
    opacity: 0.6,
    animation: '1s ease-in-out 0s infinite alternate $pulsateSlightly',
  },
  isError: {
    opacity: 0.6,
  },
}));

type InstallationPreviewProps = {
  installationName: string;
  installationsStatuses?: InstallationStatus[];
  isLastItem?: boolean;
};

const InstallationPreview = ({
  installationName,
  installationsStatuses,
  isLastItem,
}: InstallationPreviewProps) => {
  const classes = useStyles();

  const installationStatus = installationsStatuses?.find(
    status => status.installationName === installationName,
  );

  return (
    <Typography
      component="span"
      className={classnames({
        [classes.isLoading]: installationStatus?.isLoading,
        [classes.isError]: installationStatus?.isError,
      })}
    >
      {installationName}
      {isLastItem ? null : ', '}
    </Typography>
  );
};

type InstallationsSelectorProps = {
  installations: string[];
  selectedInstallations: string[];
  installationsStatuses: InstallationStatus[];
  multiple?: boolean;
  onChange?: (selectedInstallations: string[]) => void;
};

export const InstallationsSelector = ({
  installations,
  selectedInstallations,
  installationsStatuses,
  multiple,
  onChange,
}: InstallationsSelectorProps) => {
  const handleChange = (value: string | string[]) => {
    const selectedItems = Array.isArray(value) ? value : [value];

    if (
      onChange &&
      JSON.stringify(selectedItems.sort()) !==
        JSON.stringify(selectedInstallations.sort())
    ) {
      onChange(selectedItems);
    }
  };

  const renderValue = useCallback(
    () =>
      selectedInstallations.map((item, idx) => (
        <InstallationPreview
          key={item}
          installationName={item}
          installationsStatuses={installationsStatuses}
          isLastItem={idx === selectedInstallations.length - 1}
        />
      )),
    [installationsStatuses, selectedInstallations],
  );

  return multiple ? (
    <MultipleSelectFormField
      label="Installations"
      items={installations}
      selectedItems={selectedInstallations}
      renderValue={renderValue}
      onChange={handleChange}
    />
  ) : (
    <SelectFormField
      label="Installation"
      items={installations}
      selectedItem={selectedInstallations[0]}
      renderValue={renderValue}
      onChange={handleChange}
    />
  );
};
