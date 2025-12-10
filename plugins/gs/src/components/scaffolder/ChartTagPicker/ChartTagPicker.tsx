import { useCallback, useEffect, useMemo, useState } from 'react';
import { FormHelperText, Grid, TextField, Typography } from '@material-ui/core';
import Autocomplete from '@material-ui/lab/Autocomplete';
import { ChartTagPickerProps, ChartTagPickerValue } from './schema';
import { useValueFromOptions } from '../hooks/useValueFromOptions';
import { useApi } from '@backstage/core-plugin-api';
import useAsync from 'react-use/esm/useAsync';
import semver from 'semver';
import { containerRegistryApiRef } from '../../../apis/containerRegistry';
import { parseChartRef } from '../../utils/parseChartRef';

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
  const containerRegistryApi = useApi(containerRegistryApiRef);

  const [selectedVersion, setSelectedVersion] = useState<string | null>(
    value ?? null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { registry, repository } = chartRef ? parseChartRef(chartRef) : {};

  const {
    value: versionsData,
    loading: versionsLoading,
    error: versionsError,
  } = useAsync(async () => {
    if (!registry || !repository) {
      return undefined;
    }

    setErrorMessage(null);
    return await containerRegistryApi.getTags(registry, repository);
  }, [registry, repository, containerRegistryApi]);

  const sortedVersions = useMemo(() => {
    if (versionsLoading || !versionsData || !versionsData.tags) {
      return [];
    }

    return [...versionsData.tags].sort((a, b) => {
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
  }, [versionsData, versionsLoading]);

  useEffect(() => {
    if (sortedVersions.length === 0) {
      setSelectedVersion(null);
      onChange(undefined);
    }

    if (
      !selectedVersion &&
      versionsData?.latestStableVersion &&
      sortedVersions.length > 0
    ) {
      setSelectedVersion(versionsData.latestStableVersion);
      onChange(versionsData.latestStableVersion);
    }
  }, [versionsData, sortedVersions, selectedVersion, onChange]);

  useEffect(() => {
    if (versionsError) {
      setErrorMessage(
        versionsError instanceof Error
          ? versionsError.message
          : 'Failed to fetch versions',
      );
    }
  }, [versionsError]);

  const handleChange = useCallback(
    (_: any, newValue: string | null) => {
      setSelectedVersion(newValue);
      onChange(newValue ?? undefined);
    },
    [onChange],
  );

  const isLoading = versionsLoading;
  const isDisabled = isLoading || !chartRef;

  const helper = useMemo(() => {
    if (isLoading) {
      return 'Loading versions...';
    }
    if (!chartRef) {
      return 'Select a Helm chart first';
    }
    return helperText;
  }, [chartRef, helperText, isLoading]);

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
              error={error || !!errorMessage}
              disabled={isDisabled}
              InputProps={params.InputProps}
            />
          )}
        />
        {helper && <FormHelperText>{helper}</FormHelperText>}

        {errorMessage && (
          <Typography
            variant="caption"
            color="error"
            style={{ marginTop: 4, display: 'block' }}
          >
            {errorMessage}
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
    description = 'The chart version to deploy',
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
