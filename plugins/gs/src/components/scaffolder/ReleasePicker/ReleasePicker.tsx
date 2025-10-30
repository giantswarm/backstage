import { useCallback } from 'react';
import { Grid } from '@material-ui/core';
import { ReleasePickerProps } from './schema';
import semver from 'semver';
import { SelectFormField } from '../../UI/SelectFormField';
import { useValueFromOptions } from '../hooks/useValueFromOptions';
import { useResourcePicker } from '../hooks/useResourcePicker';
import {
  Release,
  useResources,
  useShowErrors,
  RELEASE_VERSION_PREFIXES,
} from '@giantswarm/backstage-plugin-kubernetes-react';

type ReleasePickerFieldProps = {
  id?: string;
  label?: string;
  helperText?: string;
  required?: boolean;
  error?: boolean;
  releaseValue?: string;
  installationName: string;
  provider?: string;
  onReleaseSelect: (selectedRelease: Release | undefined) => void;
};

const ReleasePickerField = ({
  id,
  label,
  helperText,
  required,
  error,
  releaseValue,
  installationName,
  provider,
  onReleaseSelect,
}: ReleasePickerFieldProps) => {
  const providerPrefix = provider
    ? RELEASE_VERSION_PREFIXES[provider]
    : undefined;
  const { resources, isLoading, errors } = useResources(
    installationName,
    Release,
  );
  const filteredResources = providerPrefix
    ? resources.filter(release => release.getName().startsWith(providerPrefix))
    : resources;

  useShowErrors(errors, {
    message: 'Failed to load releases',
  });

  const { resourceNames, selectedName, handleChange } = useResourcePicker({
    resources: filteredResources,
    isLoading,
    getResourceName: (release: Release) => release.getVersion(),
    initialValue: releaseValue,
    selectFirstValue: true,
    onSelect: onReleaseSelect,
    compareFn: semver.rcompare,
  });

  const disabled = isLoading || !Boolean(installationName) || errors.length > 0;

  return (
    <Grid container spacing={3} direction="column">
      <Grid item>
        <SelectFormField
          id={id}
          label={label}
          helperText={isLoading ? 'Loading releases...' : helperText}
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

export const ReleasePicker = ({
  onChange,
  rawErrors,
  required,
  formData,
  schema: { title = 'Release', description = 'The release version' },
  uiSchema,
  idSchema,
  formContext,
}: ReleasePickerProps) => {
  const releaseValue = formData;
  const {
    provider: providerOption,
    providerField: providerFieldOption,
    installationName: installationNameOption,
    installationNameField: installationNameFieldOption,
  } = uiSchema?.['ui:options'] ?? {};

  const provider = useValueFromOptions(
    formContext,
    providerOption,
    providerFieldOption,
  );

  const installationName = useValueFromOptions(
    formContext,
    installationNameOption,
    installationNameFieldOption,
  );

  const handleReleaseSelect = useCallback(
    (selectedRelease: Release | undefined) => {
      if (!selectedRelease) {
        onChange(undefined);
        return;
      }

      onChange(selectedRelease.getVersion());
    },
    [onChange],
  );

  return (
    <ReleasePickerField
      id={idSchema?.$id}
      label={title}
      helperText={description}
      required={required}
      error={rawErrors?.length > 0 && !formData}
      releaseValue={releaseValue}
      provider={provider}
      installationName={installationName ?? ''}
      onReleaseSelect={handleReleaseSelect}
    />
  );
};
