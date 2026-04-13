import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Box,
  Button,
  Divider,
  FormControl,
  FormLabel,
  Grid,
  IconButton,
  makeStyles,
  TextField,
  Tooltip,
} from '@material-ui/core';
import AddIcon from '@material-ui/icons/Add';
import DeleteOutlineIcon from '@material-ui/icons/DeleteOutline';
import InfoOutlinedIcon from '@material-ui/icons/InfoOutlined';
import ArrowUpwardIcon from '@material-ui/icons/ArrowUpward';
import ArrowDownwardIcon from '@material-ui/icons/ArrowDownward';
import { useTemplateSecrets } from '@backstage/plugin-scaffolder-react';
import type {
  ValueSourcesEditorProps,
  ValueSourcesEditorValue,
} from './schema';
import { YamlEditorFormField } from '../../UI';
import { useHelmChartValuesSchema, useTemplateString } from '../../hooks';
import { useValueFromOptions } from '../hooks/useValueFromOptions';
import { passwordManagerIgnoreProps } from '@giantswarm/backstage-plugin-ui-react';
import { Flex } from '@backstage/ui';

const useStyles = makeStyles(() => ({
  button: {
    textTransform: 'none',
  },
}));

const REDACTED_PLACEHOLDER = '***REDACTED***';

const DEFAULT_SUFFIXES: Record<'ConfigMap' | 'Secret', string> = {
  ConfigMap: 'user-values',
  Secret: 'user-secrets',
};

function nextDefaultName(
  existingItems: InternalItem[],
  prefix: string | undefined,
  kind: 'ConfigMap' | 'Secret',
): string {
  const suffix = DEFAULT_SUFFIXES[kind];
  const base = prefix ? `${prefix}-${suffix}` : suffix;
  const existing = new Set(existingItems.map(item => item.name));
  if (!existing.has(base)) return base;
  let i = 1;
  while (existing.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
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
  displayValues: string;
};

function toInternalItems(
  formData: ValueSourcesEditorValue | undefined,
): InternalItem[] {
  if (!formData || !Array.isArray(formData) || formData.length === 0) {
    return [];
  }
  return formData.map(item => ({
    id: generateItemId(),
    kind: item.kind,
    name: item.name,
    displayValues: item.kind === 'ConfigMap' ? (item.values ?? '') : '', // Secret display values are loaded from secrets context
  }));
}

function toFormData(items: InternalItem[]): ValueSourceItem[] {
  return items.map(item => ({
    kind: item.kind,
    name: item.name,
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
  height?: number;
  maxHeight?: number;
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
    height,
    maxHeight,
    onFieldChange,
    onYamlChange,
    onMoveItem,
    onRemoveItem,
  }: ValueSourceItemRowProps) => (
    <Box>
      <Grid container spacing={2} alignItems="flex-start">
        <Grid item xs={10}>
          <TextField
            label={item.kind === 'Secret' ? 'Secret name' : 'ConfigMap name'}
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
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Box>
        </Grid>
      </Grid>

      <YamlEditorFormField
        value={item.displayValues}
        onChange={value => onYamlChange(index, value ?? '')}
        schema={schema}
        height={height}
        maxHeight={maxHeight}
      />
    </Box>
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
    height,
    maxHeight,
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
    const updated: InternalItem[] = [];
    for (const item of itemsRef.current) {
      if (
        item.name === DEFAULT_SUFFIXES.ConfigMap ||
        item.name === DEFAULT_SUFFIXES.Secret
      ) {
        updated.push({
          ...item,
          name: nextDefaultName(updated, resolvedNamePrefix, item.kind),
        });
      } else {
        updated.push(item);
      }
    }
    emitChange(updated);
  }

  const handleAddItem = useCallback(
    (kind: 'ConfigMap' | 'Secret') => {
      const updated = [
        ...itemsRef.current,
        {
          id: generateItemId(),
          kind,
          name: nextDefaultName(
            itemsRef.current,
            resolvedNamePrefix ?? undefined,
            kind,
          ),
          displayValues: '',
        },
      ];
      emitChange(updated);
    },
    [emitChange, resolvedNamePrefix],
  );

  const handleRemoveItem = useCallback(
    (index: number) => {
      const item = itemsRef.current[index];
      if (
        item.displayValues &&
        // eslint-disable-next-line no-alert
        !window.confirm(
          'This value source has content. Are you sure you want to remove it?',
        )
      ) {
        return;
      }
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
      updated[index] = { ...updated[index], [field]: value };
      itemsRef.current = updated;
      // Update local state immediately so the input re-renders with the new value
      setItems(updated);
      // Debounce parent notification for text field changes
      deferNotifyParent();
    },
    [deferNotifyParent],
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
      <FormLabel>
        <Box display="flex" alignItems="center" style={{ gap: 4 }}>
          {title}
          {description && (
            <Tooltip title={description} arrow>
              <InfoOutlinedIcon fontSize="inherit" />
            </Tooltip>
          )}
        </Box>
      </FormLabel>
      <Box mt={3}>
        <Flex direction="column" gap="5">
          {items.map((item, index) => (
            <Fragment key={item.id}>
              {index > 0 && <Divider />}
              <ValueSourceItemRow
                item={item}
                index={index}
                nameError={nameErrors[index]}
                isFirst={index === 0}
                isLast={index === items.length - 1}
                schema={processedJsonSchema}
                height={height}
                maxHeight={maxHeight}
                onFieldChange={handleFieldChange}
                onYamlChange={handleYamlChange}
                onMoveItem={handleMoveItem}
                onRemoveItem={handleRemoveItem}
              />
            </Fragment>
          ))}
        </Flex>

        <Flex gap="2" mt={items.length > 0 ? '4' : '0'}>
          <Button
            variant="outlined"
            className={classes.button}
            startIcon={<AddIcon />}
            onClick={() => handleAddItem('ConfigMap')}
            size="small"
          >
            Add ConfigMap
          </Button>
          <Button
            variant="outlined"
            className={classes.button}
            startIcon={<AddIcon />}
            onClick={() => handleAddItem('Secret')}
            size="small"
          >
            Add Secret
          </Button>
        </Flex>
      </Box>
    </FormControl>
  );
};
