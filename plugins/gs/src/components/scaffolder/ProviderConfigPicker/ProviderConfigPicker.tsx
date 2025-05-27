import { useCallback, useEffect } from 'react';
import {
  getProviderConfigName,
  ProviderConfig,
} from '@giantswarm/backstage-plugin-gs-common';
import { SelectFormField } from '../../UI/SelectFormField';
import { useProviderConfigs } from '../../hooks';
import { Grid } from '@material-ui/core';
import { ProviderConfigPickerProps } from './schema';
import { useErrors } from '../../Errors';
import { useValueFromOptions } from '../hooks/useValueFromOptions';
import { useResourcePicker } from '../hooks/useResourcePicker';

type ProviderConfigPickerFieldProps = {
  id?: string;
  label?: string;
  helperText?: string;
  required?: boolean;
  error?: boolean;
  providerConfigNameValue?: string;
  installationName?: string;
  onProviderConfigSelect: (
    selectedProviderConfig: ProviderConfig | undefined,
  ) => void;
};

const ProviderConfigPickerField = ({
  id,
  label,
  helperText,
  required,
  error,
  providerConfigNameValue,
  installationName,
  onProviderConfigSelect,
}: ProviderConfigPickerFieldProps) => {
  const { showError } = useErrors();

  const installations = installationName ? [installationName] : [];
  const { resources, isLoading, errors, retry } =
    useProviderConfigs(installations);
  const loadingError = errors.length > 0 ? (errors[0] as Error) : undefined;

  useEffect(() => {
    if (!loadingError) return;

    showError(loadingError, {
      message: 'Failed to load provider configs',
      retry,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingError]);

  const { resourceNames, selectedName, handleChange } = useResourcePicker({
    resources,
    isLoading,
    getResourceName: getProviderConfigName,
    initialValue: providerConfigNameValue,
    onSelect: onProviderConfigSelect,
  });

  const disabled =
    isLoading || !Boolean(installationName) || Boolean(loadingError);

  return (
    <Grid container spacing={3} direction="column">
      <Grid item>
        <SelectFormField
          id={id}
          label={label}
          helperText={isLoading ? 'Loading provider configs...' : helperText}
          required={required}
          error={error}
          items={resourceNames}
          selectedItem={selectedName ?? ''}
          onChange={handleChange}
          disabled={disabled}
        />
      </Grid>
    </Grid>
  );
};

export const ProviderConfigPicker = ({
  onChange,
  rawErrors,
  required,
  formData,
  schema: { title = 'Provider Config', description = 'Select Provider Config' },
  uiSchema,
  idSchema,
  formContext,
}: ProviderConfigPickerProps) => {
  const providerConfigName = formData;
  const {
    installationName: installationNameOption,
    installationNameField: installationNameFieldOption,
  } = uiSchema?.['ui:options'] ?? {};

  const installationName = useValueFromOptions(
    formContext,
    installationNameOption,
    installationNameFieldOption,
  );

  const handleProviderConfigSelect = useCallback(
    (selectedProviderConfig: ProviderConfig | undefined) => {
      if (!selectedProviderConfig) {
        onChange(undefined);
        return;
      }

      onChange(getProviderConfigName(selectedProviderConfig));
    },
    [onChange],
  );

  return (
    <ProviderConfigPickerField
      id={idSchema?.$id}
      label={title}
      helperText={description}
      required={required}
      error={rawErrors?.length > 0 && !formData}
      providerConfigNameValue={providerConfigName}
      installationName={installationName}
      onProviderConfigSelect={handleProviderConfigSelect}
    />
  );
};
