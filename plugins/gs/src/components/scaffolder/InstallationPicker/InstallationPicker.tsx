import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDisabledInstallations, useInstallationsInfo } from '../../hooks';
import { Grid } from '@material-ui/core';
import { InstallationPickerProps } from './schema';
import { RadioFormField } from '../../UI/RadioFormField';
import { SelectFormField } from '../../UI/SelectFormField';
import { InstallationInfo } from '../../hooks/useInstallationsInfo';

type InstallationFieldProps = {
  id?: string;
  label?: string;
  helperText?: string;
  required?: boolean;
  error?: boolean;
  autoSelectFirstValue?: boolean;
  allowedProviders: string[];
  allowedPipelines: string[];
  installationNameValue?: string;
  widget?: string;
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
  autoSelectFirstValue = true,
  allowedProviders,
  allowedPipelines,
  installationNameValue,
  widget = 'radio',
  onInstallationSelect,
}: InstallationFieldProps) => {
  const { disabledInstallations } = useDisabledInstallations();
  const { installationsInfo } = useInstallationsInfo();
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
  const defaultValue =
    autoSelectFirstValue && activeInstallations.length > 0
      ? activeInstallations[0]
      : undefined;
  const [selectedInstallation, setSelectedInstallation] = useState<
    string | undefined
  >(installationNameValue ?? defaultValue);

  useEffect(() => {
    if (selectedInstallation && !installations.includes(selectedInstallation)) {
      setSelectedInstallation(defaultValue);
    }
  }, [activeInstallations, defaultValue, installations, selectedInstallation]);

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
        {widget === 'radio' ? (
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
        ) : (
          <SelectFormField
            id={id}
            label={label}
            helperText={helperText}
            required={required}
            error={error}
            items={installations}
            disabledItems={disabledInstallations}
            selectedItem={selectedInstallation ?? ''}
            onChange={handleChange}
          />
        )}
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
    autoSelectFirstValue,
    allowedProviders: allowedProvidersOption,
    allowedProvidersField: allowedProvidersFieldOption,
    allowedPipelines = [],
    widget,
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
      autoSelectFirstValue={autoSelectFirstValue}
      allowedProviders={allowedProviders}
      allowedPipelines={allowedPipelines}
      widget={widget}
    />
  );
};
