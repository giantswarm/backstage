import { useCallback, useEffect, useMemo } from 'react';
import { FormHelperText, Grid, TextField, Typography } from '@material-ui/core';
import Autocomplete from '@material-ui/lab/Autocomplete';
import { ChartTagPickerProps, ChartTagPickerValue } from './schema';
import { useValueFromOptions } from '../hooks/useValueFromOptions';
import semver from 'semver';
import { useHelmChartTags } from '../../hooks';

type ChartTagPickerFieldProps = {
  id?: string;
  label?: string;
  helperText?: string;
  required?: boolean;
  error?: boolean;
  value?: ChartTagPickerValue;
  chartRef?: string;
  onChange: (newValue: ChartTagPickerValue | undefined) => void;
};

const ChartTagPickerField = ({
  id,
  label,
  helperText,
  required,
  error,
  value,
  chartRef,
  onChange,
}: ChartTagPickerFieldProps) => {
  const {
    tags,
    latestStableVersion,
    error: tagsError,
    isLoading,
  } = useHelmChartTags(chartRef);

  const sortedVersions = useMemo(() => {
    if (!tags) {
      return [];
    }

    return tags
      .map(tagInfo => tagInfo.tag)
      .sort((a, b) => {
        const versionA = semver.valid(a);
        const versionB = semver.valid(b);

        if (!versionA && !versionB) {
          return 0;
        }

        if (!versionA) {
          return 1;
        }

        if (!versionB) {
          return -1;
        }

        return semver.rcompare(versionA, versionB);
      });
  }, [tags]);

  // Derive selected version from value prop - this is a controlled component
  const selectedVersion = value ?? null;

  useEffect(() => {
    // Don't do anything while still loading or waiting for tags
    if (isLoading || !tags) {
      return;
    }

    // If no versions available (tags loaded but empty), clear selection
    if (sortedVersions.length === 0) {
      if (value !== undefined) {
        onChange(undefined);
      }
      return;
    }

    // If current value is valid, keep it
    if (value && sortedVersions.includes(value)) {
      return;
    }

    // Otherwise, select the latest stable version (or first option as fallback)
    const defaultVersion = latestStableVersion ?? sortedVersions[0];
    if (defaultVersion) {
      onChange(defaultVersion);
    }
  }, [sortedVersions, onChange, isLoading, tags, value, latestStableVersion]);

  const handleChange = useCallback(
    (_: any, newValue: string | null) => {
      onChange(newValue ?? undefined);
    },
    [onChange],
  );

  const isDisabled = isLoading || !chartRef || sortedVersions.length === 0;

  const helper = useMemo(() => {
    if (isLoading) {
      return 'Loading versions...';
    }
    if (chartRef && sortedVersions.length === 0) {
      return `No versions found for the Helm chart.`;
    }
    return helperText;
  }, [chartRef, helperText, isLoading, sortedVersions.length]);

  return (
    <Grid container spacing={3} direction="column">
      <Grid item>
        <Autocomplete
          id={id}
          value={selectedVersion}
          loading={isLoading}
          onChange={handleChange}
          options={sortedVersions}
          getOptionLabel={option => option}
          disabled={isDisabled}
          renderInput={params => (
            <TextField
              {...params}
              label={label}
              margin="dense"
              variant="outlined"
              required={required}
              error={error}
              disabled={isDisabled}
              InputProps={params.InputProps}
            />
          )}
        />
        {helper && <FormHelperText>{helper}</FormHelperText>}

        {tagsError && (
          <Typography
            variant="caption"
            color="error"
            style={{ marginTop: 4, display: 'block' }}
          >
            {tagsError instanceof Error
              ? tagsError.message
              : 'Failed to fetch tags'}
          </Typography>
        )}
      </Grid>
    </Grid>
  );
};

export const ChartTagPicker = ({
  onChange,
  rawErrors,
  required,
  formData,
  schema: {
    title = 'Chart Version',
    description = 'Select the Helm chart version you want to deploy.',
  },
  uiSchema,
  idSchema,
  formContext,
}: ChartTagPickerProps) => {
  const { chartRef: chartRefOption, chartRefField: chartRefFieldOption } =
    uiSchema?.['ui:options'] ?? {};

  const chartRef = useValueFromOptions(
    formContext,
    chartRefOption,
    chartRefFieldOption,
  );

  const handleChange = useCallback(
    (newValue: ChartTagPickerValue | undefined) => {
      if (formData !== newValue) {
        onChange(newValue);
      }
    },
    [formData, onChange],
  );

  return (
    <ChartTagPickerField
      id={idSchema?.$id}
      label={title}
      helperText={description}
      required={required}
      error={rawErrors?.length > 0 && !formData}
      value={formData}
      chartRef={chartRef}
      onChange={handleChange}
    />
  );
};
