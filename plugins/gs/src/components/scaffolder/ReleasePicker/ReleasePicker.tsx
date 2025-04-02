import React, { useCallback, useEffect, useMemo } from 'react';
import { Box, Grid, Typography } from '@material-ui/core';
import { ReleasePickerProps } from './schema';
import { GSContext } from '../../GSContext';
import { useReleases } from '../../hooks';
import semver from 'semver';
import { getReleaseVersion } from '@giantswarm/backstage-plugin-gs-common';
import { get } from 'lodash';
import { SelectFormField } from '../../UI/SelectFormField';
import { ErrorsProvider, useErrors } from '../../Errors';

type ReleasePickerFieldProps = {
  id?: string;
  label?: string;
  helperText?: string;
  required?: boolean;
  error?: boolean;
  releaseValue?: string;
  installationName: string;
  onReleaseSelect: (selectedRelease: string | undefined) => void;
};

const ReleasePickerField = ({
  id,
  label,
  helperText,
  required,
  error,
  releaseValue,
  installationName,
  onReleaseSelect,
}: ReleasePickerFieldProps) => {
  const { showError } = useErrors();
  const { resources, isLoading, errors, retry } = useReleases([
    installationName,
  ]);
  const loadingError = errors.length > 0 ? (errors[0] as Error) : undefined;

  useEffect(() => {
    if (!loadingError) return;

    showError(loadingError, { message: 'Failed to load releases', retry });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingError]);

  const releases = useMemo(() => {
    if (isLoading) {
      return [];
    }

    return resources
      .map(release => getReleaseVersion(release))
      .sort(semver.rcompare);
  }, [isLoading, resources]);

  const [selectedRelease, setSelectedRelease] = React.useState<
    string | undefined
  >(releaseValue ?? releases[0]);

  useEffect(() => {
    if (
      !selectedRelease ||
      (!isLoading && selectedRelease && !releases.includes(selectedRelease))
    ) {
      setSelectedRelease(releases[0]);
    }
  }, [isLoading, releases, selectedRelease]);

  useEffect(() => {
    onReleaseSelect(selectedRelease);
  }, [onReleaseSelect, selectedRelease]);

  const handleChange = (selectedItem: string) => {
    setSelectedRelease(selectedItem);
  };

  return (
    <Grid container spacing={3} direction="column">
      <Grid item>
        {isLoading ? (
          <Box mt={2}>
            <Typography variant="body1" color="textSecondary">
              Loading releases...
            </Typography>
          </Box>
        ) : (
          <SelectFormField
            id={id}
            label={label}
            helperText={helperText}
            required={required}
            error={error}
            items={releases}
            selectedItem={selectedRelease ?? ''}
            onChange={handleChange}
          />
        )}
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
    installationName: installationNameOption,
    installationNameField: installationNameFieldOption,
  } = uiSchema?.['ui:options'] ?? {};

  const installationName = useMemo(() => {
    if (installationNameOption) {
      return installationNameOption;
    }

    if (installationNameFieldOption) {
      const allFormData = (formContext.formData as Record<string, any>) ?? {};
      const installationNameFieldValue = get(
        allFormData,
        installationNameFieldOption,
      ) as string;

      return installationNameFieldValue;
    }

    return '';
  }, [
    installationNameOption,
    installationNameFieldOption,
    formContext.formData,
  ]);

  const handleReleaseSelect = useCallback(
    (selectedRelease: string | undefined) => {
      onChange(selectedRelease);
    },
    [onChange],
  );

  return (
    <GSContext>
      <ErrorsProvider>
        <ReleasePickerField
          id={idSchema?.$id}
          label={title}
          helperText={description}
          required={required}
          error={rawErrors?.length > 0 && !formData}
          releaseValue={releaseValue}
          installationName={installationName ?? ''}
          onReleaseSelect={handleReleaseSelect}
        />
      </ErrorsProvider>
    </GSContext>
  );
};
