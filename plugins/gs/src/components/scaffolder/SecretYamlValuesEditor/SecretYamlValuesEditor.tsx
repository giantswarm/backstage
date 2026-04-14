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
    height: heightOption,
    maxHeight: maxHeightOption,
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
          // Write to a per-index key to avoid read-modify-write race conditions
          // when multiple array instances share the same secretsKey.
          // An aggregation effect below combines per-index keys into the final map.
          const indexKey = `${secretsKey}__${arrayIndex}`;
          setSecrets({ [indexKey]: yamlContent });
        } else {
          setSecrets({ [secretsKey]: yamlContent });
        }
      }

      // Store redacted placeholder in formData so the actual value
      // is never persisted in the scaffolder task parameters
      onChange(yamlContent ? REDACTED_PLACEHOLDER : undefined);
    },
    [secretsKey, isArrayMode, arrayIndex, setSecrets, onChange],
  );

  // In array mode, aggregate per-index keys into the shared secretsKey map.
  // This runs after React batches all individual setSecrets calls, so it reads
  // consistent state and avoids the race condition of read-modify-write.
  useEffect(() => {
    if (!isArrayMode || !secretsKey) return;

    const prefix = `${secretsKey}__`;
    const map: Record<string, string> = {};
    for (const [key, val] of Object.entries(secrets)) {
      if (key.startsWith(prefix) && val) {
        const idx = key.slice(prefix.length);
        map[idx] = val as string;
      }
    }
    const aggregated = JSON.stringify(map);
    if (secrets[secretsKey] !== aggregated) {
      setSecrets({ [secretsKey]: aggregated });
    }
  }, [isArrayMode, secretsKey, secrets, setSecrets]);

  return (
    <YamlEditorFormField
      label={title}
      helperText={description}
      required={required}
      value={displayValue}
      onChange={handleChange}
      height={heightOption}
      maxHeight={maxHeightOption}
      schema={processedJsonSchema}
      error={rawErrors.length > 0}
    />
  );
};
