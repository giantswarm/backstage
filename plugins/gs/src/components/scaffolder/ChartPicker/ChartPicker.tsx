import { useCallback, useEffect, useMemo, useState } from 'react';
import { FormHelperText, Grid, TextField, Typography } from '@material-ui/core';
import Autocomplete from '@material-ui/lab/Autocomplete';
import { ChartPickerProps, ChartPickerValue } from './schema';
import { useValueFromOptions } from '../hooks/useValueFromOptions';
import { getHelmChartsFromEntity, GS_HELMCHARTS } from '../../utils/entity';
import { parseChartRef } from '../../utils/parseChartRef';
import { useCatalogEntityByRef } from '../../hooks';

type ChartPickerFieldProps = {
  id?: string;
  label?: string;
  helperText?: string;
  required?: boolean;
  error?: boolean;
  value?: ChartPickerValue;
  entityRef?: string;
  onChange: (newValue: ChartPickerValue | undefined) => void;
};

const ChartPickerField = ({
  id,
  label,
  helperText,
  required,
  error,
  value,
  entityRef,
  onChange,
}: ChartPickerFieldProps) => {
  const [selectedChart, setSelectedChart] = useState<string | null>(
    value ?? null,
  );

  const { entity, isLoading: isLoadingEntity } =
    useCatalogEntityByRef(entityRef);

  const chartOptions = useMemo(() => {
    if (!entity) {
      return [];
    }

    const charts = getHelmChartsFromEntity(entity);

    return charts.map(chart => chart.ref);
  }, [entity]);

  useEffect(() => {
    if (chartOptions.length === 0) {
      setSelectedChart(null);
      onChange(undefined);
    }

    if (!selectedChart && chartOptions.length > 0) {
      setSelectedChart(chartOptions[0]);
      onChange(chartOptions[0]);
    }
  }, [chartOptions, selectedChart, onChange]);

  const handleChange = useCallback(
    (_: any, newValue: string | null) => {
      setSelectedChart(newValue);
      onChange(newValue ?? undefined);
    },
    [onChange],
  );

  const isLoading = isLoadingEntity;
  const isDisabled = isLoading || !entityRef;

  const helper = useMemo(() => {
    if (isLoading) {
      return 'Loading charts...';
    }
    if (!entityRef) {
      return 'Select an application first';
    }
    if (chartOptions.length === 0) {
      return `No charts found. Entity is missing "${GS_HELMCHARTS}" annotation.`;
    }
    return helperText;
  }, [entityRef, helperText, isLoading, chartOptions.length]);

  const errorMessage = '';

  return (
    <Grid container spacing={3} direction="column">
      <Grid item>
        <Autocomplete
          id={id}
          value={selectedChart}
          loading={isLoading}
          onChange={handleChange}
          options={chartOptions}
          getOptionLabel={option => parseChartRef(option).name}
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

export const ChartPicker = ({
  onChange,
  rawErrors,
  required,
  formData,
  schema: { title = 'Chart', description = 'The chart to deploy' },
  uiSchema,
  idSchema,
  formContext,
}: ChartPickerProps) => {
  const { entityRef: entityRefOption, entityRefField: entityRefFieldOption } =
    uiSchema?.['ui:options'] ?? {};

  const entityRef = useValueFromOptions(
    formContext,
    entityRefOption,
    entityRefFieldOption,
  );

  const handleChange = useCallback(
    (newValue: ChartPickerValue | undefined) => {
      if (formData !== newValue) {
        onChange(newValue);
      }
    },
    [formData, onChange],
  );

  return (
    <ChartPickerField
      id={idSchema?.$id}
      label={title}
      helperText={description}
      required={required}
      error={rawErrors?.length > 0 && !formData}
      value={formData}
      entityRef={entityRef}
      onChange={handleChange}
    />
  );
};
