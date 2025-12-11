import { useMemo } from 'react';
import type { YamlValuesEditorProps } from './schema';
import { YamlEditorFormField } from '../../UI';
import { useHelmChartValuesSchema } from '../../hooks';
import { useValueFromOptions } from '../hooks/useValueFromOptions';

export const YamlValuesEditor = ({
  onChange,
  formData,
  formContext,
  required,
  schema: { title = 'Values', description = 'Values in YAML format' },
  uiSchema,
  rawErrors,
}: YamlValuesEditorProps): JSX.Element => {
  const {
    chartRef: chartRefOption,
    chartRefField: chartRefFieldOption,
    chartTag: chartTagOption,
    chartTagField: chartTagFieldOption,
  } = uiSchema?.['ui:options'] ?? {};

  const chartRef = useValueFromOptions(
    formContext,
    chartRefOption,
    chartRefFieldOption,
  );

  const chartTag = useValueFromOptions(
    formContext,
    chartTagOption,
    chartTagFieldOption,
  );

  const values = formData || '';

  const { schema: jsonSchema } = useHelmChartValuesSchema(chartRef, chartTag);

  const processedJsonSchema = useMemo(() => {
    if (!jsonSchema) {
      return {};
    }
    return {
      ...jsonSchema,
      required: undefined,
    };
  }, [jsonSchema]);

  return (
    <YamlEditorFormField
      label={title}
      helperText={description}
      required={required}
      value={values}
      onChange={onChange}
      schema={processedJsonSchema}
      error={rawErrors.length > 0}
    />
  );
};
