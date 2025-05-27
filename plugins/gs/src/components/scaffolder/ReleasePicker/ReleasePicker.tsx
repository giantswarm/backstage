import { useCallback, useEffect } from 'react';
import { Grid } from '@material-ui/core';
import { ReleasePickerProps } from './schema';
import { useReleases } from '../../hooks';
import semver from 'semver';
import {
  getReleaseName,
  getReleaseVersion,
  Release,
  RELEASE_VERSION_PREFIXES,
} from '@giantswarm/backstage-plugin-gs-common';
import { SelectFormField } from '../../UI/SelectFormField';
import { useErrors } from '../../Errors';
import { useValueFromOptions } from '../hooks/useValueFromOptions';
import { useResourcePicker } from '../hooks/useResourcePicker';

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
  const { showError } = useErrors();
  const providerPrefix = provider
    ? RELEASE_VERSION_PREFIXES[provider]
    : undefined;
  const { resources, isLoading, errors, retry } = useReleases([
    installationName,
  ]);
  const filteredResources = providerPrefix
    ? resources.filter(release =>
        getReleaseName(release).startsWith(providerPrefix),
      )
    : resources;
  const loadingError = errors.length > 0 ? (errors[0] as Error) : undefined;

  useEffect(() => {
    if (!loadingError) return;

    showError(loadingError, { message: 'Failed to load releases', retry });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingError]);

  const { resourceNames, selectedName, handleChange } = useResourcePicker({
    resources: filteredResources,
    isLoading,
    getResourceName: getReleaseVersion,
    initialValue: releaseValue,
    selectFirstValue: true,
    onSelect: onReleaseSelect,
    compareFn: semver.rcompare,
  });

  const disabled =
    isLoading || !Boolean(installationName) || Boolean(loadingError);

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

      onChange(getReleaseName(selectedRelease));
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
