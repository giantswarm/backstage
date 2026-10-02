import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDisabledInstallations, useInstallationsInfo } from '../../hooks';
import { Grid, TextField } from '@material-ui/core';
import Autocomplete from '@material-ui/lab/Autocomplete';
import { InstallationPickerProps } from './schema';
import { RadioFormField } from '../../UI/RadioFormField';
import { InstallationInfo } from '../../hooks/useInstallationsInfo';
import { useValueFromOptions } from '../hooks/useValueFromOptions';

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
  const { isLoading: isLoadingDisabledInstallations, disabledInstallations } =
    useDisabledInstallations();
  const { installationsInfo, isLoading: isLoadingInstallations } =
    useInstallationsInfo();
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

    // Sort installations in eu-north-* regions to the top, as these are
    // the most climate-friendly (lowest carbon intensity).
    filteredInstallations.sort((a, b) => {
      const euNorthPrefix = 'eu-north-';
      const aEuNorth = a.region?.startsWith(euNorthPrefix) ? 0 : 1;
      const bEuNorth = b.region?.startsWith(euNorthPrefix) ? 0 : 1;
      return aEuNorth - bEuNorth;
    });

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
  // Which installations can be picked is only known once the list has loaded
  // and the health checks are in: an installation with a `backendUrl` override
  // counts as disabled until its check answers.
  const isSettled = !isLoadingInstallations && !isLoadingDisabledInstallations;
  // A single selectable installation is not a choice, whether it is the only
  // allowed one or the others are disabled: select it for the person, even
  // with `autoSelectFirstValue: false`.
  const soleActiveInstallation =
    isSettled && activeInstallations.length === 1
      ? activeInstallations[0]
      : undefined;
  const defaultValue =
    soleActiveInstallation ??
    (autoSelectFirstValue && activeInstallations.length > 0
      ? activeInstallations[0]
      : undefined);
  const [selectedInstallation, setSelectedInstallation] = useState<
    string | undefined
  >(installationNameValue ?? defaultValue);
  // The value the sole-option rule picked (rather than the person or
  // `autoSelectFirstValue`), withdrawn again once there is a real choice.
  const soleAutoPick = useRef<string | undefined>(
    installationNameValue === undefined ? soleActiveInstallation : undefined,
  );

  useEffect(() => {
    const isSelectedDisabled =
      !isLoadingDisabledInstallations &&
      selectedInstallation !== undefined &&
      disabledInstallations.includes(selectedInstallation);
    // Not while the list is loading: it is empty then, and a restored value
    // would be dropped before it could be matched.
    const isSelectedGone =
      !isLoadingInstallations &&
      selectedInstallation !== undefined &&
      !installations.includes(selectedInstallation);
    if (selectedInstallation && isSelectedGone) {
      soleAutoPick.current = soleActiveInstallation;
      setSelectedInstallation(defaultValue);
    } else if (selectedInstallation && isSelectedDisabled) {
      // A pick the health check has just marked disabled (a single slow answer
      // is enough) is withdrawn, but never swapped for a different
      // installation the person didn't choose: only the sole active one may
      // take its place, otherwise the required field is left empty.
      soleAutoPick.current = soleActiveInstallation;
      setSelectedInstallation(soleActiveInstallation);
    } else if (!selectedInstallation && soleActiveInstallation) {
      soleAutoPick.current = soleActiveInstallation;
      setSelectedInstallation(soleActiveInstallation);
    } else if (
      isSettled &&
      !soleActiveInstallation &&
      soleAutoPick.current !== undefined &&
      selectedInstallation === soleAutoPick.current
    ) {
      soleAutoPick.current = undefined;
      if (!autoSelectFirstValue) {
        setSelectedInstallation(undefined);
      }
    }
  }, [
    autoSelectFirstValue,
    defaultValue,
    disabledInstallations,
    installations,
    isLoadingDisabledInstallations,
    isLoadingInstallations,
    isSettled,
    selectedInstallation,
    soleActiveInstallation,
  ]);

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
    soleAutoPick.current = undefined;
    setSelectedInstallation(selectedItem);
  };

  // Only one allowed installation, selected for the person: nothing to show.
  // Stay hidden while that is still being worked out (the list loading, its
  // health check pending) rather than flashing a disabled option first. Once
  // the field has been on screen it stays, so the form doesn't shift under the
  // person; a disabled option then explains why there is no choice.
  const wasShown = useRef(false);
  const isHidden =
    !wasShown.current &&
    (isLoadingInstallations ||
      (installations.length === 1 &&
        (isLoadingDisabledInstallations ||
          soleActiveInstallation !== undefined)));
  if (!isHidden) {
    wasShown.current = true;
  }
  if (isHidden) {
    return null;
  }

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
          <Autocomplete
            id={id}
            value={selectedInstallation ?? null}
            onChange={(_: any, newValue: string | null) => {
              handleChange(newValue ?? '');
            }}
            options={installations}
            getOptionLabel={option => {
              const idx = installations.indexOf(option);
              return idx >= 0 ? installationLabels[idx] : option;
            }}
            getOptionDisabled={option => disabledInstallations.includes(option)}
            renderInput={params => (
              <TextField
                {...params}
                label={label}
                helperText={helperText}
                required={required}
                error={error}
                margin="dense"
                variant="outlined"
                InputProps={params.InputProps}
                InputLabelProps={params.InputLabelProps}
              />
            )}
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
    disabledWhenField: disabledWhenFieldOption,
  } = uiSchema?.['ui:options'] ?? {};

  const isDisabledByField = useValueFromOptions<boolean>(
    formContext,
    undefined,
    disabledWhenFieldOption,
  );

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

  if (isDisabledByField) {
    return (
      <TextField
        id={idSchema?.$id}
        label={title}
        required={required}
        value={installationName ?? ''}
        disabled
        margin="dense"
        variant="outlined"
        InputLabelProps={{ shrink: true }}
      />
    );
  }

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
