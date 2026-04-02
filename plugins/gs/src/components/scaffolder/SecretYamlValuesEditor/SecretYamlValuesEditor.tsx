import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTemplateSecrets } from '@backstage/plugin-scaffolder-react';
import type { SecretYamlValuesEditorProps } from './schema';
import { YamlEditorFormField } from '../../UI';
import { useHelmChartValuesSchema } from '../../hooks';
import { useValueFromOptions } from '../hooks/useValueFromOptions';

const REDACTED_PLACEHOLDER = '***REDACTED***';

/**
 * Extract array index from an RJSF idSchema.$id string.
 * For example, "root_valueSources_2_values" → "2".
 * Returns undefined when the field is not inside an array.
 */
function extractArrayIndex(idSchemaId: string | undefined): string | undefined {
  if (!idSchemaId) return undefined;
  const match = idSchemaId.match(/_(\d+)_[^_]+$/);
  return match?.[1];
}

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
  idSchema,
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

  // Detect whether this instance is inside an array item.
  // When in array mode, secret values are aggregated as a JSON map
  // under the shared secretsKey (e.g. { "0": "yaml...", "2": "yaml..." }).
  const arrayIndex = extractArrayIndex(idSchema?.$id);
  const isArrayMode = arrayIndex !== undefined;

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

    let secretValue: string | undefined;
    if (isArrayMode) {
      // In array mode, parse the JSON map and look up our index
      try {
        const map = JSON.parse((secrets[secretsKey] as string) || '{}');
        secretValue = map[arrayIndex];
      } catch {
        secretValue = undefined;
      }
    } else {
      secretValue = secrets[secretsKey] as string | undefined;
    }

    if (secretValue && !displayValueRef.current) {
      hasAppliedInitialValue.current = true;
      displayValueRef.current = secretValue;
      setDisplayValue(secretValue);
      onChange(REDACTED_PLACEHOLDER);
    }
  }, [secrets, secretsKey, isArrayMode, arrayIndex, onChange]);

  const handleChange = useCallback(
    (value?: string) => {
      const yamlContent = value || '';
      displayValueRef.current = yamlContent;
      setDisplayValue(yamlContent);

      if (secretsKey) {
        if (isArrayMode) {
          // Aggregate: read existing map, update our index, write back
          let map: Record<string, string> = {};
          try {
            map = JSON.parse((secrets[secretsKey] as string) || '{}');
          } catch {
            // ignore parse errors
          }
          if (yamlContent) {
            map[arrayIndex] = yamlContent;
          } else {
            delete map[arrayIndex];
          }
          setSecrets({ [secretsKey]: JSON.stringify(map) });
        } else {
          setSecrets({ [secretsKey]: yamlContent });
        }
      }

      // Store redacted placeholder in formData so the actual value
      // is never persisted in the scaffolder task parameters
      onChange(yamlContent ? REDACTED_PLACEHOLDER : undefined);
    },
    [secretsKey, isArrayMode, arrayIndex, secrets, setSecrets, onChange],
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
