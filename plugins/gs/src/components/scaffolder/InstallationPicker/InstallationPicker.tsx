import React, { useCallback, useEffect, useMemo } from 'react';
import { useInstallations, InstallationInfo } from '../../hooks';
import { Grid } from '@material-ui/core';
import { InstallationPickerProps } from './schema';
import { RadioFormField } from '../../UI/RadioFormField';

type InstallationFieldProps = {
  id?: string;
  label?: string;
  helperText?: string;
  required?: boolean;
  error?: boolean;
  requestUserCredentials?: boolean;
  secretsKey?: string;
  allowedProviders: string[];
  allowedPipelines: string[];
  installationNameValue?: string;
  onInstallationSelect: (
    selectedInstallation: InstallationInfo | undefined,
  ) => void;
};

const InstallationPickerField = ({
  id,
  label,
  helperText,
  required,
  error,
  allowedProviders,
  allowedPipelines,
  installationNameValue,
  onInstallationSelect,
}: InstallationFieldProps) => {
  const { installationsInfo } = useInstallations();
  const installations = useMemo(() => {
    let filteredInstallations = installationsInfo;

    if (allowedProviders.length > 0) {
      filteredInstallations = filteredInstallations.filter(installation => {
        return allowedProviders.some(provider =>
          installation.providers.includes(provider),
        );
      });
    }

    if (allowedPipelines.length > 0) {
      filteredInstallations = filteredInstallations.filter(installation => {
        return allowedPipelines.includes(installation.pipeline);
      });
    }

    return filteredInstallations.map(installation => installation.name);
  }, [allowedProviders, allowedPipelines, installationsInfo]);

  const [selectedInstallation, setSelectedInstallation] = React.useState<
    string | undefined
  >(installationNameValue ?? installations[0]);

  useEffect(() => {
    if (selectedInstallation && !installations.includes(selectedInstallation)) {
      setSelectedInstallation(installations[0]);
    }
  }, [installations, selectedInstallation]);

  useEffect(() => {
    const selectedInstallationInfo = installationsInfo.find(
      installation => installation.name === selectedInstallation,
    );

    if (selectedInstallationInfo) {
      onInstallationSelect(selectedInstallationInfo);
    }
  }, [installationsInfo, onInstallationSelect, selectedInstallation]);

  const handleChange = (selectedItem: string) => {
    setSelectedInstallation(selectedItem);
  };

  return (
    <Grid container spacing={3} direction="column">
      <Grid item>
        <RadioFormField
          id={id}
          label={label}
          helperText={helperText}
          required={required}
          error={error}
          items={installations}
          selectedItem={selectedInstallation ?? ''}
          onChange={handleChange}
        />
      </Grid>
    </Grid>
  );
};

export const InstallationPicker = ({
  onChange,
  rawErrors,
  required,
  formData,
  schema: { title = 'Installation', description = 'Installation name' },
  uiSchema,
  idSchema,
  formContext,
}: InstallationPickerProps) => {
  const { installationName } = formData ?? {};

  const {
    requestUserCredentials,
    allowedProviders: allowedProvidersOption,
    allowedProvidersField: allowedProvidersFieldOption,
    allowedPipelines = [],
  } = uiSchema?.['ui:options'] ?? {};

  const allowedProviders = useMemo(() => {
    if (allowedProvidersOption) {
      return allowedProvidersOption;
    }

    if (allowedProvidersFieldOption) {
      const allFormData = (formContext.formData as Record<string, any>) ?? {};
      const allowedProvidersFieldValue = allFormData[
        allowedProvidersFieldOption
      ] as string | string[];

      return Array.isArray(allowedProvidersFieldValue)
        ? allowedProvidersFieldValue
        : [allowedProvidersFieldValue];
    }

    return [];
  }, [
    allowedProvidersOption,
    allowedProvidersFieldOption,
    formContext.formData,
  ]);

  const handleInstallationSelect = useCallback(
    (selectedInstallation: InstallationInfo | undefined) => {
      if (!selectedInstallation) {
        return;
      }

      onChange({
        installationName: selectedInstallation.name,
        installationBaseDomain: selectedInstallation.baseDomain,
      });
    },
    [onChange],
  );

  return (
    <InstallationPickerField
      id={idSchema?.$id}
      label={title}
      helperText={description}
      required={required}
      error={rawErrors?.length > 0 && !formData}
      installationNameValue={installationName}
      onInstallationSelect={handleInstallationSelect}
      requestUserCredentials={Boolean(requestUserCredentials)}
      secretsKey={requestUserCredentials?.secretsKey}
      allowedProviders={allowedProviders}
      allowedPipelines={allowedPipelines}
    />
  );
};
