import { useCallback, useEffect, useMemo, useState } from 'react';
import { useInstallations, InstallationInfo } from '../../hooks';
import { Grid } from '@material-ui/core';
import { InstallationPickerProps, InstallationPickerValue } from './schema';
import { RadioFormField } from '../../UI/RadioFormField';
import { GSContext } from '../../GSContext';
import { ErrorsProvider } from '../../Errors';
import { FieldValidation } from '@rjsf/utils';

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
  const { disabledInstallations, installationsInfo } = useInstallations();
  const { installations, installationLabels } = useMemo(() => {
    let filteredInstallations = installationsInfo;
    const labels: string[] = [];

    // Filter by provider
    if (allowedProviders.length > 0) {
      filteredInstallations = filteredInstallations.filter(installation => {
        return allowedProviders.some(provider =>
          installation.providers.includes(provider),
        );
      });
    }

    // Filter by pipeline
    if (allowedPipelines.length > 0) {
      filteredInstallations = filteredInstallations.filter(installation => {
        return allowedPipelines.includes(installation.pipeline);
      });
    }

    filteredInstallations.forEach((installation, idx) => {
      labels[idx] = installation.name;
      if (installation.region || installation.pipeline) {
        const info = [];
        if (installation.region) {
          info.push(`region ${installation.region}`);
        }
        if (installation.pipeline) {
          info.push(`pipeline ${installation.pipeline}`);
        }
        labels[idx] += ` (${info.join(', ')})`;
      }
    });

    return {
      installations: filteredInstallations.map(
        installation => installation.name,
      ),
      installationLabels: labels,
    };
  }, [allowedProviders, allowedPipelines, installationsInfo]);

  const activeInstallations = installations.filter(
    installation => !disabledInstallations.includes(installation),
  );
  const [selectedInstallation, setSelectedInstallation] = useState<
    string | undefined
  >(installationNameValue ?? activeInstallations[0]);

  useEffect(() => {
    if (selectedInstallation && !installations.includes(selectedInstallation)) {
      setSelectedInstallation(activeInstallations[0]);
    }
  }, [activeInstallations, installations, selectedInstallation]);

  useEffect(() => {
    const selectedInstallationInfo = installationsInfo.find(
      installation => installation.name === selectedInstallation,
    );

    if (selectedInstallationInfo) {
      onInstallationSelect(selectedInstallationInfo);
    } else {
      onInstallationSelect({} as InstallationInfo);
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
          itemLabels={installationLabels}
          disabledItems={disabledInstallations}
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
    <GSContext>
      <ErrorsProvider>
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
      </ErrorsProvider>
    </GSContext>
  );
};

export const installationPickerValidation = (
  value: InstallationPickerValue,
  validation: FieldValidation,
) => {
  if (!value.installationName) {
    validation.addError(`Please fill in this field`);
  }
};
