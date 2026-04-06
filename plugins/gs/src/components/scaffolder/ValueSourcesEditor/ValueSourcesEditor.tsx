import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  FormControl,
  FormHelperText,
  FormLabel,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  Select,
  TextField,
  Typography,
} from '@material-ui/core';
import AddIcon from '@material-ui/icons/Add';
import DeleteIcon from '@material-ui/icons/Delete';
import ArrowUpwardIcon from '@material-ui/icons/ArrowUpward';
import ArrowDownwardIcon from '@material-ui/icons/ArrowDownward';
import { useTemplateSecrets } from '@backstage/plugin-scaffolder-react';
import type {
  ValueSourcesEditorProps,
  ValueSourcesEditorValue,
} from './schema';
import { YamlEditorFormField } from '../../UI';
import { useHelmChartValuesSchema } from '../../hooks';
import { useValueFromOptions } from '../hooks/useValueFromOptions';

const REDACTED_PLACEHOLDER = '***REDACTED***';

type ValueSourceItem = NonNullable<ValueSourcesEditorValue>[number];

type InternalItem = {
  kind: 'ConfigMap' | 'Secret';
  name: string;
  valuesKey: string;
  displayValues: string;
};

function toInternalItems(
  formData: ValueSourcesEditorValue | undefined,
): InternalItem[] {
  if (!formData || !Array.isArray(formData) || formData.length === 0) {
    return [
      {
        kind: 'ConfigMap',
        name: 'user-values',
        valuesKey: 'values',
        displayValues: '',
      },
      {
        kind: 'Secret',
        name: 'user-secrets',
        valuesKey: 'values',
        displayValues: '',
      },
    ];
  }
  return formData.map(item => ({
    kind: item.kind,
    name: item.name,
    valuesKey: item.valuesKey ?? 'values',
    displayValues: item.kind === 'ConfigMap' ? (item.configValues ?? '') : '', // Secret display values are loaded from secrets context
  }));
}

function toFormData(items: InternalItem[]): ValueSourceItem[] {
  return items.map(item => ({
    kind: item.kind,
    name: item.name,
    valuesKey: item.valuesKey,
    configValues:
      item.kind === 'ConfigMap' ? item.displayValues || undefined : undefined,
    secretValues:
      item.kind === 'Secret' && item.displayValues
        ? REDACTED_PLACEHOLDER
        : undefined,
  }));
}

export const ValueSourcesEditor = ({
  onChange,
  formData,
  formContext,
  schema: { title = 'Value sources', description },
  uiSchema,
  rawErrors,
}: ValueSourcesEditorProps): JSX.Element => {
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
    if (!jsonSchema) return {};
    return { ...jsonSchema, required: undefined };
  }, [jsonSchema]);

  const { setSecrets, secrets } = useTemplateSecrets();

  // Internal state: items with their actual display values
  const [items, setItems] = useState<InternalItem[]>(() => {
    const initial = toInternalItems(formData);
    // Restore secret display values from secrets context
    if (secretsKey) {
      try {
        const map = JSON.parse((secrets[secretsKey] as string) || '{}');
        return initial.map((item, i) => {
          if (item.kind === 'Secret' && map[String(i)]) {
            return { ...item, displayValues: map[String(i)] };
          }
          return item;
        });
      } catch {
        // ignore
      }
    }
    return initial;
  });

  // Ref to avoid stale closures
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Sync secrets context whenever items change
  const syncSecrets = useCallback(
    (updatedItems: InternalItem[]) => {
      if (!secretsKey) return;
      const map: Record<string, string> = {};
      updatedItems.forEach((item, i) => {
        if (item.kind === 'Secret' && item.displayValues) {
          map[String(i)] = item.displayValues;
        }
      });
      setSecrets({ [secretsKey]: JSON.stringify(map) });
    },
    [secretsKey, setSecrets],
  );

  const emitChange = useCallback(
    (updatedItems: InternalItem[]) => {
      setItems(updatedItems);
      syncSecrets(updatedItems);
      onChange(toFormData(updatedItems));
    },
    [onChange, syncSecrets],
  );

  const handleAddItem = useCallback(() => {
    const updated = [
      ...itemsRef.current,
      {
        kind: 'ConfigMap' as const,
        name: '',
        valuesKey: 'values',
        displayValues: '',
      },
    ];
    emitChange(updated);
  }, [emitChange]);

  const handleRemoveItem = useCallback(
    (index: number) => {
      const updated = itemsRef.current.filter((_, i) => i !== index);
      emitChange(updated);
    },
    [emitChange],
  );

  const handleMoveItem = useCallback(
    (index: number, direction: -1 | 1) => {
      const updated = [...itemsRef.current];
      const target = index + direction;
      if (target < 0 || target >= updated.length) return;
      [updated[index], updated[target]] = [updated[target], updated[index]];
      emitChange(updated);
    },
    [emitChange],
  );

  const handleFieldChange = useCallback(
    (index: number, field: keyof InternalItem, value: string) => {
      const updated = [...itemsRef.current];
      const item = { ...updated[index] };

      if (field === 'kind') {
        const newKind = value as 'ConfigMap' | 'Secret';
        // When switching kind, clear values to avoid cross-contamination
        item.kind = newKind;
        item.displayValues = '';
      } else {
        (item as any)[field] = value;
      }

      updated[index] = item;
      emitChange(updated);
    },
    [emitChange],
  );

  const handleYamlChange = useCallback(
    (index: number, value: string) => {
      const updated = [...itemsRef.current];
      updated[index] = { ...updated[index], displayValues: value };
      emitChange(updated);
    },
    [emitChange],
  );

  return (
    <FormControl fullWidth error={rawErrors.length > 0}>
      <FormLabel>{title}</FormLabel>
      {description && <FormHelperText>{description}</FormHelperText>}
      <Box mt={1}>
        {items.map((item, index) => (
          <Paper
            key={index}
            variant="outlined"
            style={{ padding: 16, marginBottom: 12 }}
          >
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={3}>
                <FormControl fullWidth size="small">
                  <Select
                    value={item.kind}
                    onChange={e =>
                      handleFieldChange(index, 'kind', e.target.value as string)
                    }
                    variant="outlined"
                  >
                    <MenuItem value="ConfigMap">ConfigMap</MenuItem>
                    <MenuItem value="Secret">Secret</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={4}>
                <TextField
                  label="Name suffix"
                  value={item.name}
                  onChange={e =>
                    handleFieldChange(index, 'name', e.target.value)
                  }
                  variant="outlined"
                  size="small"
                  fullWidth
                />
              </Grid>
              <Grid item xs={3}>
                <TextField
                  label="Data key"
                  value={item.valuesKey}
                  onChange={e =>
                    handleFieldChange(index, 'valuesKey', e.target.value)
                  }
                  variant="outlined"
                  size="small"
                  fullWidth
                />
              </Grid>
              <Grid item xs={2}>
                <Box display="flex" justifyContent="flex-end">
                  <IconButton
                    size="small"
                    onClick={() => handleMoveItem(index, -1)}
                    disabled={index === 0}
                    title="Move up"
                  >
                    <ArrowUpwardIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => handleMoveItem(index, 1)}
                    disabled={index === items.length - 1}
                    title="Move down"
                  >
                    <ArrowDownwardIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => handleRemoveItem(index)}
                    title="Remove"
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Grid>
            </Grid>

            <Box mt={2}>
              <Typography variant="caption" color="textSecondary">
                {item.kind === 'Secret'
                  ? 'Values (YAML, stored securely)'
                  : 'Values (YAML)'}
              </Typography>
              <YamlEditorFormField
                value={item.displayValues}
                onChange={value => handleYamlChange(index, value ?? '')}
                schema={processedJsonSchema}
              />
            </Box>
          </Paper>
        ))}

        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={handleAddItem}
          size="small"
        >
          Add value source
        </Button>
      </Box>
    </FormControl>
  );
};
