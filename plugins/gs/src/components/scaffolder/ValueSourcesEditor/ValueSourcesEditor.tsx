import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
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
import { isValidDNSSubdomainName } from '@giantswarm/backstage-plugin-kubernetes-react';
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

function restoreSecretDisplayValues(
  items: InternalItem[],
  secrets: Record<string, string>,
  secretsKey: string | undefined,
): InternalItem[] {
  if (!secretsKey) return items;
  try {
    const map: Record<string, string> = JSON.parse(
      (secrets[secretsKey] as string) || '{}',
    );
    return items.map(item =>
      item.kind === 'Secret' && map[item.name]
        ? { ...item, displayValues: map[item.name] }
        : item,
    );
  } catch {
    return items;
  }
}

// --- Reducer ---

type ItemsAction =
  | { type: 'INITIALIZE'; items: InternalItem[] }
  | {
      type: 'ADD';
      kind: 'ConfigMap' | 'Secret';
      namePrefix: string | undefined;
    }
  | { type: 'REMOVE'; index: number }
  | { type: 'MOVE'; index: number; direction: -1 | 1 }
  | {
      type: 'UPDATE_FIELD';
      index: number;
      field: keyof InternalItem;
      value: string;
    }
  | { type: 'UPDATE_YAML'; index: number; value: string }
  | { type: 'APPLY_NAME_PREFIX'; prefix: string };

function itemsReducer(
  state: InternalItem[],
  action: ItemsAction,
): InternalItem[] {
  switch (action.type) {
    case 'INITIALIZE':
      return action.items;
    case 'ADD':
      return [
        ...state,
        {
          id: generateItemId(),
          kind: action.kind,
          name: nextDefaultName(state, action.namePrefix, action.kind),
          displayValues: '',
        },
      ];
    case 'REMOVE':
      return state.filter((_, i) => i !== action.index);
    case 'MOVE': {
      const target = action.index + action.direction;
      if (target < 0 || target >= state.length) return state;
      const next = [...state];
      [next[action.index], next[target]] = [next[target], next[action.index]];
      return next;
    }
    case 'UPDATE_FIELD': {
      const next = [...state];
      next[action.index] = {
        ...next[action.index],
        [action.field]: action.value,
      };
      return next;
    }
    case 'UPDATE_YAML': {
      const next = [...state];
      next[action.index] = {
        ...next[action.index],
        displayValues: action.value,
      };
      return next;
    }
    case 'APPLY_NAME_PREFIX': {
      const result: InternalItem[] = [];
      for (const item of state) {
        if (
          item.name === DEFAULT_SUFFIXES.ConfigMap ||
          item.name === DEFAULT_SUFFIXES.Secret
        ) {
          result.push({
            ...item,
            name: nextDefaultName(result, action.prefix, item.kind),
          });
        } else {
          result.push(item);
        }
      }
      return result;
    }
    default:
      return state;
  }
}

// --- Row component ---

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
  onRemoveItem: (index: number, hasContent: boolean) => void;
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
              onClick={() => onRemoveItem(index, Boolean(item.displayValues))}
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

// --- Main component ---

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

  // --- State (useReducer eliminates itemsRef and stale closure issues) ---
  const [items, dispatch] = useReducer(itemsReducer, undefined, () => {
    const hasFormData =
      formData && Array.isArray(formData) && formData.length > 0;
    const hasInitial =
      initialValueSources &&
      Array.isArray(initialValueSources) &&
      initialValueSources.length > 0;
    const source = hasInitial && !hasFormData ? initialValueSources : formData;
    const initial = toInternalItems(source);
    return restoreSecretDisplayValues(
      initial,
      secrets as Record<string, string>,
      secretsKey,
    );
  });

  // --- Helpers ---
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

  // --- Initialization: propagate initial value sources to formData ---
  // onChange must be deferred via setTimeout(0) — RJSF overwrites synchronous
  // onChange calls for array-typed fields during its own initialization phase.
  // (String-typed fields like YamlValuesEditor don't have this issue.)
  const hasAppliedInitialSources = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const initTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    let resolvedItems: InternalItem[];
    if (items.length === 0) {
      // Async case: initialValueSources arrived after mount, items not yet set
      resolvedItems = restoreSecretDisplayValues(
        toInternalItems(initialValueSources),
        secrets as Record<string, string>,
        secretsKey,
      );
      dispatch({ type: 'INITIALIZE', items: resolvedItems });
    } else {
      // Sync case: items already loaded in useReducer init
      resolvedItems = items;
    }

    syncSecrets(resolvedItems);
    // Defer onChange — uses ref to always get the latest onChange callback
    if (initTimerRef.current !== null) clearTimeout(initTimerRef.current);
    const fd = toFormData(resolvedItems);
    initTimerRef.current = setTimeout(() => {
      initTimerRef.current = null;
      onChangeRef.current(fd);
    }, 0);
  }, [initialValueSources, formData, items, secretsKey, secrets, syncSecrets]);

  // --- Name template resolution ---
  const hasAppliedNameTemplate = useRef(false);

  useEffect(() => {
    if (hasAppliedNameTemplate.current || !resolvedNamePrefix) return;
    const needsPrefix = items.some(
      item =>
        item.name === DEFAULT_SUFFIXES.ConfigMap ||
        item.name === DEFAULT_SUFFIXES.Secret,
    );
    if (!needsPrefix) return;
    hasAppliedNameTemplate.current = true;
    dispatch({ type: 'APPLY_NAME_PREFIX', prefix: resolvedNamePrefix });
  }, [resolvedNamePrefix, items]);

  // --- User-driven change notification ---
  // pendingModeRef tracks whether a dispatch needs immediate or debounced
  // parent notification. Set before dispatch, read in the effect.
  const pendingModeRef = useRef<'none' | 'immediate' | 'debounced'>('none');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (pendingModeRef.current === 'none') return;
    const mode = pendingModeRef.current;
    pendingModeRef.current = 'none';

    syncSecrets(items);
    const fd = toFormData(items);

    if (mode === 'debounced') {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        onChange(fd);
      }, 200);
    } else {
      onChange(fd);
    }
  }, [items, syncSecrets, onChange]);

  // Flush pending timers on unmount
  useEffect(
    () => () => {
      if (initTimerRef.current !== null) {
        clearTimeout(initTimerRef.current);
        onChangeRef.current(toFormData(items));
      }
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        onChange(toFormData(items));
      }
    },
    [onChange, items],
  );

  // --- Event handlers ---
  const handleAddItem = useCallback(
    (kind: 'ConfigMap' | 'Secret') => {
      pendingModeRef.current = 'immediate';
      dispatch({
        type: 'ADD',
        kind,
        namePrefix: resolvedNamePrefix ?? undefined,
      });
    },
    [resolvedNamePrefix],
  );

  const handleRemoveItem = useCallback((index: number, hasContent: boolean) => {
    if (
      hasContent &&
      // eslint-disable-next-line no-alert
      !window.confirm(
        'This value source has content. Are you sure you want to remove it?',
      )
    ) {
      return;
    }
    pendingModeRef.current = 'immediate';
    dispatch({ type: 'REMOVE', index });
  }, []);

  const handleMoveItem = useCallback((index: number, direction: -1 | 1) => {
    pendingModeRef.current = 'immediate';
    dispatch({ type: 'MOVE', index, direction });
  }, []);

  const handleFieldChange = useCallback(
    (index: number, field: keyof InternalItem, value: string) => {
      pendingModeRef.current = 'debounced';
      dispatch({ type: 'UPDATE_FIELD', index, field, value });
    },
    [],
  );

  const handleYamlChange = useCallback((index: number, value: string) => {
    pendingModeRef.current = 'debounced';
    dispatch({ type: 'UPDATE_YAML', index, value });
  }, []);

  const nameErrors = useMemo(() => {
    const errors: (string | undefined)[] = items.map(() => undefined);
    const kindNameIndices = new Map<string, Map<string, number[]>>();

    items.forEach((item, i) => {
      if (!item.displayValues) return;
      const name = item.name.trim();
      if (!name) {
        errors[i] = 'Name is required when values are provided';
        return;
      }
      if (!isValidDNSSubdomainName(name)) {
        errors[i] =
          "Must be lowercase, alphanumeric, '-' or '.', max 253 chars";
        return;
      }
      const byName =
        kindNameIndices.get(item.kind) ?? new Map<string, number[]>();
      const indices = byName.get(name) ?? [];
      indices.push(i);
      byName.set(name, indices);
      kindNameIndices.set(item.kind, byName);
    });

    for (const [kind, byName] of kindNameIndices) {
      for (const [, indices] of byName) {
        if (indices.length > 1) {
          for (const i of indices) {
            errors[i] = `${kind} name must be unique`;
          }
        }
      }
    }

    return errors;
  }, [items]);

  // --- Render ---
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
