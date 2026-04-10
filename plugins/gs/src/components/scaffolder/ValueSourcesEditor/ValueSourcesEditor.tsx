import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { Flex } from '@backstage/ui';

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

let nextItemId = 0;
function generateItemId(): string {
  return `vs-${++nextItemId}`;
}

type InternalItem = {
  id: string;
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
        id: generateItemId(),
        kind: 'ConfigMap',
        name: defaultName(namePrefix, 'ConfigMap'),
        valuesKey: 'values',
        displayValues: '',
      },
      {
        id: generateItemId(),
        kind: 'Secret',
        name: defaultName(namePrefix, 'Secret'),
        valuesKey: 'values',
        displayValues: '',
      },
    ];
  }
  return formData.map(item => ({
    id: generateItemId(),
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

type ValueSourceItemRowProps = {
  item: InternalItem;
  index: number;
  nameError: string | undefined;
  isFirst: boolean;
  isLast: boolean;
  schema: Record<string, any>;
  onFieldChange: (
    index: number,
    field: keyof InternalItem,
    value: string,
  ) => void;
  onYamlChange: (index: number, value: string) => void;
  onMoveItem: (index: number, direction: -1 | 1) => void;
  onRemoveItem: (index: number) => void;
};

const ValueSourceItemRow = memo(
  ({
    item,
    index,
    nameError,
    isFirst,
    isLast,
    schema,
    onFieldChange,
    onYamlChange,
    onMoveItem,
    onRemoveItem,
  }: ValueSourceItemRowProps) => (
    <Paper variant="outlined" style={{ padding: 16 }} data-config-docs-anchor>
      <Grid container spacing={2} alignItems="flex-start">
        <Grid item xs={3}>
          <FormControl fullWidth size="small">
            <Select
              value={item.kind}
              onChange={e =>
                onFieldChange(index, 'kind', e.target.value as string)
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
            onChange={e => onFieldChange(index, 'name', e.target.value)}
            variant="outlined"
            size="small"
            fullWidth
            error={Boolean(nameError)}
            helperText={nameError}
            inputProps={passwordManagerIgnoreProps}
          />
        </Grid>
        <Grid item xs={3}>
          <TextField
            label="Data key"
            value={item.valuesKey}
            onChange={e => onFieldChange(index, 'valuesKey', e.target.value)}
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
              onClick={() => onMoveItem(index, -1)}
              disabled={isFirst}
              title="Move up"
            >
              <ArrowUpwardIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              onClick={() => onMoveItem(index, 1)}
              disabled={isLast}
              title="Move down"
            >
              <ArrowDownwardIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              onClick={() => onRemoveItem(index)}
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
          onChange={value => onYamlChange(index, value ?? '')}
          schema={schema}
        />
      </Box>
    </Paper>
  ),
);

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
    initialValueSourcesField,
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

  const initialValueSources = useValueFromOptions<ValueSourcesEditorValue>(
    formContext,
    undefined,
    initialValueSourcesField,
  );

  // Internal state: items with their actual display values
  const [items, setItems] = useState<InternalItem[]>(() => {
    // Prefer formData when it has content (preserved across step navigation),
    // then fall back to initialValueSources (edit mode first load)
    const hasFormData =
      formData && Array.isArray(formData) && formData.length > 0;
    const hasInitial =
      initialValueSources &&
      Array.isArray(initialValueSources) &&
      initialValueSources.length > 0;
    let source = formData;
    if (hasInitial && !hasFormData) {
      source = initialValueSources;
    }
    const initial = toInternalItems(source);
    // Restore secret display values from secrets context
    if (secretsKey) {
      try {
        const map = JSON.parse((secrets[secretsKey] as string) || '{}');
        return initial.map(item => {
          if (item.kind === 'Secret' && map[item.name]) {
            return { ...item, displayValues: map[item.name] };
          }
          return item;
        });
      } catch {
        // ignore
      }
    }
    return initial;
  });

  // Re-initialize when initial value sources arrive (async from DeploymentPicker)
  const hasAppliedInitialSources = useRef(false);

  const hasAppliedNameTemplate = useRef(false);

  // Ref to avoid stale closures
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Sync secrets context whenever items change
  const syncSecrets = useCallback(
    (updatedItems: InternalItem[]) => {
      if (!secretsKey) return;
      const map: Record<string, string> = {};
      updatedItems.forEach(item => {
        if (item.kind === 'Secret' && item.displayValues) {
          map[item.name] = item.displayValues;
        }
      });
      setSecrets({ [secretsKey]: JSON.stringify(map) });
    },
    [secretsKey, setSecrets],
  );

  // Notify parent form of changes (expensive — triggers full form re-render)
  const notifyParent = useCallback(
    (updatedItems: InternalItem[]) => {
      syncSecrets(updatedItems);
      onChange(toFormData(updatedItems));
    },
    [onChange, syncSecrets],
  );

  const emitChange = useCallback(
    (updatedItems: InternalItem[]) => {
      setItems(updatedItems);
      notifyParent(updatedItems);
    },
    [notifyParent],
  );

  // Re-initialize when initial value sources arrive (async from DeploymentPicker)
  // Skip if formData already has content (user edited and navigated back)
  useEffect(() => {
    if (
      hasAppliedInitialSources.current ||
      !initialValueSources ||
      !Array.isArray(initialValueSources) ||
      initialValueSources.length === 0
    ) {
      return;
    }
    if (formData && Array.isArray(formData) && formData.length > 0) {
      hasAppliedInitialSources.current = true;
      return;
    }
    hasAppliedInitialSources.current = true;
    const initial = toInternalItems(initialValueSources);
    if (secretsKey) {
      try {
        const map = JSON.parse((secrets[secretsKey] as string) || '{}');
        const withSecrets = initial.map(item => {
          if (item.kind === 'Secret' && map[item.name]) {
            return { ...item, displayValues: map[item.name] };
          }
          return item;
        });
        emitChange(withSecrets);
      } catch {
        emitChange(initial);
      }
    } else {
      emitChange(initial);
    }
  }, [initialValueSources, formData, secretsKey, secrets, emitChange]);

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
        id: generateItemId(),
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

  // Debounce parent notification: update local state immediately for
  // responsive UI, but defer the expensive parent form onChange + secrets
  // sync. CodeMirror manages its own document so YAML only needs the
  // deferred notification.
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Flush pending parent notification on unmount
  useEffect(
    () => () => {
      if (flushTimerRef.current !== null) {
        clearTimeout(flushTimerRef.current);
        notifyParent(itemsRef.current);
      }
    },
    [notifyParent],
  );

  const deferNotifyParent = useCallback(() => {
    if (flushTimerRef.current !== null) {
      clearTimeout(flushTimerRef.current);
    }
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null;
      notifyParent(itemsRef.current);
    }, 200);
  }, [notifyParent]);

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
      itemsRef.current = updated;
      // Update local state immediately so the input re-renders with the new value
      setItems(updated);

      if (field === 'kind') {
        // Kind changes are infrequent and affect UI structure — notify parent immediately
        notifyParent(updated);
      } else {
        // Text fields (name, valuesKey) — debounce parent notification
        deferNotifyParent();
      }
    },
    [notifyParent, deferNotifyParent],
  );

  const handleYamlChange = useCallback(
    (index: number, value: string) => {
      const updated = [...itemsRef.current];
      updated[index] = { ...updated[index], displayValues: value };
      itemsRef.current = updated;
      // Update local state so nameErrors/mergedValues recompute correctly
      // and itemsRef doesn't get overwritten with stale state on re-render.
      // This is cheap — YamlEditorFormField is memo'd and uncontrolled.
      setItems(updated);
      deferNotifyParent();
    },
    [deferNotifyParent],
  );

  return (
    <FormControl fullWidth error={rawErrors.length > 0}>
      <FormLabel>{title}</FormLabel>
      <Box mt={1}>
        <Flex direction="column" gap="3">
          {items.map((item, index) => (
            <ValueSourceItemRow
              key={item.id}
              item={item}
              index={index}
              nameError={nameErrors[index]}
              isFirst={index === 0}
              isLast={index === items.length - 1}
              schema={processedJsonSchema}
              onFieldChange={handleFieldChange}
              onYamlChange={handleYamlChange}
              onMoveItem={handleMoveItem}
              onRemoveItem={handleRemoveItem}
            />
          ))}
        </Flex>

        {description && <FormHelperText>{description}</FormHelperText>}

        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={handleAddItem}
          size="small"
          style={{ marginTop: 12 }}
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
