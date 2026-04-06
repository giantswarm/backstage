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
import { makeStyles } from '@material-ui/core/styles';
import AddIcon from '@material-ui/icons/Add';
import DeleteIcon from '@material-ui/icons/Delete';
import ArrowUpwardIcon from '@material-ui/icons/ArrowUpward';
import ArrowDownwardIcon from '@material-ui/icons/ArrowDownward';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import WarningIcon from '@material-ui/icons/Warning';
import * as yaml from 'js-yaml';
import classNames from 'classnames';
import { useTemplateSecrets } from '@backstage/plugin-scaffolder-react';
import type {
  ValueSourcesEditorProps,
  ValueSourcesEditorValue,
} from './schema';
import { YamlEditorFormField } from '../../UI';
import {
  useHelmChartValuesSchema,
  useHelmValuesValidation,
  useTemplateString,
} from '../../hooks';
import { useValueFromOptions } from '../hooks/useValueFromOptions';
import { passwordManagerIgnoreProps } from '@giantswarm/backstage-plugin-ui-react';
import { helmMerge } from '../utils/helmMerge';

const REDACTED_PLACEHOLDER = '***REDACTED***';

const useStyles = makeStyles(theme => ({
  icon: {
    marginRight: theme.spacing(1),
    fontSize: '20px',
  },
  iconWarning: {
    color: theme.palette.warning.main,
  },
  iconSuccess: {
    color: theme.palette.success.main,
  },
  warningText: {
    color: theme.palette.warning.main,
    marginTop: theme.spacing(1),
  },
}));

const DEFAULT_SUFFIXES: Record<'ConfigMap' | 'Secret', string> = {
  ConfigMap: 'user-values',
  Secret: 'user-secrets',
};

function defaultName(
  prefix: string | undefined,
  kind: 'ConfigMap' | 'Secret',
): string {
  const suffix = DEFAULT_SUFFIXES[kind];
  return prefix ? `${prefix}-${suffix}` : suffix;
}

type ValueSourceItem = NonNullable<ValueSourcesEditorValue>[number];

type InternalItem = {
  kind: 'ConfigMap' | 'Secret';
  name: string;
  valuesKey: string;
  displayValues: string;
};

function toInternalItems(
  formData: ValueSourcesEditorValue | undefined,
  namePrefix?: string,
): InternalItem[] {
  if (!formData || !Array.isArray(formData) || formData.length === 0) {
    return [
      {
        kind: 'ConfigMap',
        name: defaultName(namePrefix, 'ConfigMap'),
        valuesKey: 'values',
        displayValues: '',
      },
      {
        kind: 'Secret',
        name: defaultName(namePrefix, 'Secret'),
        valuesKey: 'values',
        displayValues: '',
      },
    ];
  }
  return formData.map(item => ({
    kind: item.kind,
    name: item.name,
    valuesKey: item.valuesKey ?? 'values',
    displayValues: item.kind === 'ConfigMap' ? (item.values ?? '') : '', // Secret display values are loaded from secrets context
  }));
}

function toFormData(items: InternalItem[]): ValueSourceItem[] {
  return items.map(item => ({
    kind: item.kind,
    name: item.name,
    valuesKey: item.valuesKey,
    values:
      item.kind === 'Secret' && item.displayValues
        ? REDACTED_PLACEHOLDER
        : item.displayValues || undefined,
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
  const classes = useStyles();
  const {
    secretsKey,
    chartRef: chartRefOption,
    chartRefField: chartRefFieldOption,
    chartTag: chartTagOption,
    chartTagField: chartTagFieldOption,
    initialNamePrefixTemplate,
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

  const allFormData = useMemo(
    () => (formContext.formData as Record<string, any>) ?? {},
    [formContext.formData],
  );
  const resolvedNamePrefix = useTemplateString(
    initialNamePrefixTemplate ?? '',
    allFormData,
  );

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

  const hasAppliedNameTemplate = useRef(false);

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

  // Apply resolved prefix to default items once the template resolves
  if (
    !hasAppliedNameTemplate.current &&
    resolvedNamePrefix &&
    itemsRef.current.some(
      item =>
        item.name === DEFAULT_SUFFIXES.ConfigMap ||
        item.name === DEFAULT_SUFFIXES.Secret,
    )
  ) {
    hasAppliedNameTemplate.current = true;
    const updated = itemsRef.current.map(item => {
      if (
        item.name === DEFAULT_SUFFIXES.ConfigMap ||
        item.name === DEFAULT_SUFFIXES.Secret
      ) {
        return { ...item, name: defaultName(resolvedNamePrefix, item.kind) };
      }
      return item;
    });
    emitChange(updated);
  }

  const handleAddItem = useCallback(() => {
    const kind = 'ConfigMap' as const;
    const updated = [
      ...itemsRef.current,
      {
        kind,
        name: defaultName(resolvedNamePrefix ?? undefined, kind),
        valuesKey: 'values',
        displayValues: '',
      },
    ];
    emitChange(updated);
  }, [emitChange, resolvedNamePrefix]);

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

  const nameErrors = useMemo(() => {
    const errors: (string | undefined)[] = items.map(() => undefined);
    const nameIndices = new Map<string, number[]>();

    items.forEach((item, i) => {
      if (!item.displayValues) return;
      const name = item.name.trim();
      if (!name) {
        errors[i] = 'Name is required when values are provided';
        return;
      }
      const indices = nameIndices.get(name) ?? [];
      indices.push(i);
      nameIndices.set(name, indices);
    });

    for (const indices of nameIndices.values()) {
      if (indices.length > 1) {
        for (const i of indices) {
          errors[i] = 'Name must be unique across value sources';
        }
      }
    }

    return errors;
  }, [items]);

  const mergedValues = useMemo(() => {
    let result = {};
    for (const item of items) {
      if (item.displayValues) {
        try {
          const parsed = yaml.load(item.displayValues);
          if (parsed && typeof parsed === 'object') {
            result = helmMerge(result, parsed);
          }
        } catch {
          // YAML parse error — skip this item, the YAML editor already shows inline errors
        }
      }
    }
    return result;
  }, [items]);

  const { warnings: schemaWarnings } = useHelmValuesValidation(
    mergedValues,
    jsonSchema,
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
            data-config-docs-anchor
          >
            <Grid container spacing={2} alignItems="flex-start">
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
                  label="Name"
                  value={item.name}
                  onChange={e =>
                    handleFieldChange(index, 'name', e.target.value)
                  }
                  variant="outlined"
                  size="small"
                  fullWidth
                  error={Boolean(nameErrors[index])}
                  helperText={nameErrors[index]}
                  inputProps={passwordManagerIgnoreProps}
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
                  inputProps={passwordManagerIgnoreProps}
                />
              </Grid>
              <Grid item xs={2}>
                <Box display="flex" justifyContent="flex-end" pt="7px" pb="7px">
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

        {jsonSchema &&
          (schemaWarnings.length > 0 ? (
            <Box mt={2}>
              <Box display="flex" alignItems="center">
                <WarningIcon
                  className={classNames(classes.icon, classes.iconWarning)}
                />
                <Typography variant="body2">
                  Merged configuration is not valid, according to the chart's
                  values schema
                </Typography>
              </Box>
              {schemaWarnings.map((warning, index) => (
                <FormHelperText key={index} className={classes.warningText}>
                  <code>{warning}</code>
                </FormHelperText>
              ))}
            </Box>
          ) : (
            <Box mt={2} display="flex" alignItems="center">
              <CheckCircleIcon
                className={classNames(classes.icon, classes.iconSuccess)}
              />
              <Typography variant="body2">
                Merged configuration is valid, according to the chart's values
                schema
              </Typography>
            </Box>
          ))}
      </Box>
    </FormControl>
  );
};
