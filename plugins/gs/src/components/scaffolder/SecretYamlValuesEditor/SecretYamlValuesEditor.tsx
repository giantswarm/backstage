import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

  const { setSecrets, secrets } = useTemplateSecrets();

  // Track the actual YAML content as state so the editor re-renders when
  // the value is populated asynchronously (e.g. by DeploymentPicker).
  // A ref is kept in sync to avoid stale closures in handleChange.
  const [displayValue, setDisplayValue] = useState(() => {
    if (formData && formData !== REDACTED_PLACEHOLDER) {
      return formData;
    }
    return '';
  });
  const displayValueRef = useRef(displayValue);
  const hasAppliedInitialValue = useRef(false);

  // Apply initial value from secrets context (e.g. pre-populated by DeploymentPicker in edit mode)
  useEffect(() => {
    if (hasAppliedInitialValue.current || !secretsKey) return;

    const secretValue = secrets[secretsKey] as string | undefined;
    if (secretValue && !displayValueRef.current) {
      hasAppliedInitialValue.current = true;
      displayValueRef.current = secretValue;
      setDisplayValue(secretValue);
      onChange(REDACTED_PLACEHOLDER);
    }
  }, [secrets, secretsKey, onChange]);

  const handleChange = useCallback(
    (value?: string) => {
      const yamlContent = value || '';
      displayValueRef.current = yamlContent;
      setDisplayValue(yamlContent);

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
      value={displayValue}
      onChange={handleChange}
      schema={processedJsonSchema}
      error={rawErrors.length > 0}
    />
  );
};
