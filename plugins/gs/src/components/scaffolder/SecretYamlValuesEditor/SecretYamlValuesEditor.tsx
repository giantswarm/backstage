import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTemplateSecrets } from '@backstage/plugin-scaffolder-react';
import type { SecretYamlValuesEditorProps } from './schema';
import { YamlEditorFormField } from '../../UI';
import { useHelmChartValuesSchema } from '../../hooks';
import { useValueFromOptions } from '../hooks/useValueFromOptions';

const REDACTED_PLACEHOLDER = '***REDACTED***';

export const SecretYamlValuesEditor = ({
  onChange,
  formData,
  formContext,
  required,
  schema: {
    title = 'Secret values',
    description = 'Secret values in YAML format (stored securely)',
  },
  uiSchema,
  rawErrors,
}: SecretYamlValuesEditorProps): JSX.Element => {
  const {
    secretsKey,
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

  const { setSecrets } = useTemplateSecrets();

  // Keep the actual YAML content in a ref so we can display it in the editor
  // while storing the redacted placeholder in formData
  const actualValueRef = useRef<string>('');

  // Initialize from formData only if it's not the redacted placeholder
  useEffect(() => {
    if (formData && formData !== REDACTED_PLACEHOLDER) {
      actualValueRef.current = formData;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = useCallback(
    (value?: string) => {
      const yamlContent = value || '';
      actualValueRef.current = yamlContent;

      if (secretsKey) {
        setSecrets({ [secretsKey]: yamlContent });
      }

      // Store redacted placeholder in formData so the actual value
      // is never persisted in the scaffolder task parameters
      onChange(yamlContent ? REDACTED_PLACEHOLDER : undefined);
    },
    [secretsKey, setSecrets, onChange],
  );

  return (
    <YamlEditorFormField
      label={title}
      helperText={description}
      required={required}
      value={actualValueRef.current}
      onChange={handleChange}
      schema={processedJsonSchema}
      error={rawErrors.length > 0}
    />
  );
};
