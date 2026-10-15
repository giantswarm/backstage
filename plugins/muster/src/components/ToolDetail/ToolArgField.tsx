import {
  Box,
  Button,
  ButtonIcon,
  Flex,
  NumberField,
  Select,
  Switch,
  Text,
  TextAreaField,
  TextField,
  Tooltip,
  TooltipTrigger,
} from '@backstage/ui';
import { useId } from 'react';
import AddIcon from '@material-ui/icons/Add';
import DeleteOutlineIcon from '@material-ui/icons/DeleteOutline';
import {
  fieldErrorProps,
  useGroupFieldError,
  useSelectFieldError,
  type FieldBlurProps,
} from '@giantswarm/backstage-plugin-ui-react';
import { fieldKind, FormValue, SchemaField } from '../../lib/schemaForm';

function helperFor(field: SchemaField): string | undefined {
  if (field.description) {
    return field.description;
  }
  if (field.default !== undefined) {
    return `Default: ${JSON.stringify(field.default)}`;
  }
  return undefined;
}

/** The per-row editor inside an array field, chosen from the item type. */
function ArrayItemInput({
  label,
  itemType,
  enumOptions,
  value,
  onChange,
  isInvalid,
  describedBy,
}: {
  label: string;
  itemType?: string;
  enumOptions: { id: string; label: string }[];
  value: string;
  onChange: (next: string) => void;
  /** This row is the one the field's error is about. */
  isInvalid?: boolean;
  describedBy?: string;
}) {
  const invalidProps = isInvalid
    ? { isInvalid: true, 'aria-describedby': describedBy }
    : {};
  if (enumOptions.length > 0) {
    return (
      <Select
        {...invalidProps}
        aria-label={label}
        options={enumOptions}
        selectedKey={value || null}
        onSelectionChange={key => onChange(key === null ? '' : String(key))}
      />
    );
  }
  if (itemType === 'number') {
    return (
      <NumberField
        {...invalidProps}
        aria-label={label}
        value={value === '' ? NaN : Number(value)}
        onChange={n => onChange(Number.isNaN(n) ? '' : String(n))}
      />
    );
  }
  return (
    <TextField
      {...invalidProps}
      aria-label={label}
      value={value}
      onChange={v => onChange(v)}
    />
  );
}

function ArrayField({
  field,
  value,
  error,
  invalidItem,
  jsonMode,
  onChange,
  onToggleJson,
}: {
  field: SchemaField;
  value: FormValue | undefined;
  error?: string;
  invalidItem?: number;
  jsonMode: boolean;
  onChange: (value: FormValue) => void;
  onToggleJson: () => void;
}) {
  const rows = Array.isArray(value) ? value : [];
  const id = useId();
  const labelId = `${id}-label`;
  const descriptionId = `${id}-description`;
  const rowsError = useGroupFieldError(
    jsonMode ? undefined : error,
    field.description ? descriptionId : undefined,
  );
  // An error about one item marks that row, so a blocked run focuses it;
  // otherwise the rows are invalid as a whole and the first one takes it.
  const atRow = error && invalidItem !== undefined ? invalidItem : undefined;

  const setRow = (index: number, next: string) => {
    const copy = [...rows];
    copy[index] = next;
    onChange(copy);
  };
  const addRow = () => onChange([...rows, '']);
  const removeRow = (index: number) =>
    onChange(rows.filter((_, i) => i !== index));

  const enumOptions = (field.itemEnumValues ?? []).map(option => {
    const v = String(option);
    return { id: v, label: v };
  });

  return (
    <Box mb="4">
      <Flex align="baseline" justify="between" mb="1">
        <Text variant="body-medium" id={labelId}>
          {field.name}
          {field.required ? ' *' : ''}{' '}
          <Text variant="body-small" color="secondary">
            (array of {field.itemType ?? 'string'})
          </Text>
        </Text>
        <Button variant="tertiary" size="small" onClick={onToggleJson}>
          {jsonMode ? 'Edit as rows' : 'Edit as JSON'}
        </Button>
      </Flex>

      {jsonMode ? (
        <TextAreaField
          aria-labelledby={labelId}
          aria-describedby={field.description ? descriptionId : undefined}
          rows={3}
          placeholder='["a", "b"]'
          value={typeof value === 'string' ? value : ''}
          onChange={v => onChange(v)}
          {...fieldErrorProps(error)}
        />
      ) : (
        <Flex
          direction="column"
          gap="2"
          aria-labelledby={labelId}
          {...rowsError.groupProps}
          {...(atRow !== undefined ? { 'data-invalid': undefined } : {})}
        >
          {rows.map((row, index) => (
            <Flex key={index} align="center" gap="2">
              <Box style={{ flexGrow: 1 }}>
                <ArrayItemInput
                  label={`${field.name} item ${index + 1}`}
                  itemType={field.itemType}
                  enumOptions={enumOptions}
                  value={row}
                  onChange={next => setRow(index, next)}
                  isInvalid={index === atRow}
                  describedBy={rowsError.messageId}
                />
              </Box>
              <TooltipTrigger>
                <ButtonIcon
                  variant="tertiary"
                  size="small"
                  icon={<DeleteOutlineIcon fontSize="small" />}
                  onClick={() => removeRow(index)}
                />
                <Tooltip>Remove</Tooltip>
              </TooltipTrigger>
            </Flex>
          ))}
          <Box>
            <Button
              variant="secondary"
              size="small"
              iconStart={<AddIcon fontSize="inherit" />}
              onClick={addRow}
            >
              Add item
            </Button>
          </Box>
        </Flex>
      )}

      {rowsError.message && <Box mt="1">{rowsError.message}</Box>}
      {field.description && (
        <Text
          id={descriptionId}
          variant="body-small"
          color="secondary"
          style={{ display: 'block', marginTop: 4 }}
        >
          {field.description}
        </Text>
      )}
    </Box>
  );
}

export interface ToolArgFieldProps {
  field: SchemaField;
  value: FormValue | undefined;
  /** The problem to show on the field, once the form shows it. */
  error?: string;
  /** For an array whose error is about one item: that item's index. */
  invalidItem?: number;
  /** The form's `useFieldValidation().blurProps` for this field. */
  blurProps?: FieldBlurProps;
  jsonMode: boolean;
  onChange: (value: FormValue) => void;
  onToggleJson: () => void;
}

/**
 * Renders one tool argument with a widget chosen from its JSON-schema type:
 * switch (boolean), select (enum), number stepper, editable rows or a JSON-paste
 * textarea (array/object), or a text field — each with the arg description as
 * helper text and inline validation errors.
 */
export function ToolArgField({
  field,
  value,
  error,
  invalidItem,
  blurProps,
  jsonMode,
  onChange,
  onToggleJson,
}: ToolArgFieldProps) {
  const kind = fieldKind(field);
  const selectError = useSelectFieldError(kind === 'enum' ? error : undefined);

  if (kind === 'boolean') {
    return (
      <Box mb="4">
        <Switch
          label={`${field.name}${field.required ? ' *' : ''} · ${
            field.description ?? 'boolean'
          }`}
          isSelected={Boolean(value ?? field.default ?? false)}
          onChange={checked => onChange(checked)}
        />
      </Box>
    );
  }

  if (kind === 'array') {
    return (
      <Box {...blurProps}>
        <ArrayField
          field={field}
          value={value}
          error={error}
          invalidItem={invalidItem}
          jsonMode={jsonMode}
          onChange={onChange}
          onToggleJson={onToggleJson}
        />
      </Box>
    );
  }

  const helperText = helperFor(field);
  const label = `${field.name} (${field.type})`;

  if (kind === 'enum') {
    // A leading "unset" entry lets an optional enum be cleared back to empty
    // (react-aria Select has no built-in clear); the sentinel maps to '' so it
    // is dropped from the call payload.
    const UNSET = '__unset__';
    return (
      <Box mb="4" {...blurProps}>
        <Select
          label={label}
          description={helperText}
          isRequired={field.required}
          placeholder="Select a value"
          options={[
            { id: UNSET, label: 'unset' },
            ...(field.enumValues ?? []).map(option => {
              const v = String(option);
              return { id: v, label: v };
            }),
          ]}
          selectedKey={(value as string | undefined) || null}
          onSelectionChange={key =>
            onChange(key === null || key === UNSET ? '' : String(key))
          }
          {...selectError.selectProps}
        />
        {selectError.message}
      </Box>
    );
  }

  if (kind === 'number') {
    return (
      <Box mb="4" {...blurProps}>
        <NumberField
          label={label}
          description={helperText}
          isRequired={field.required}
          {...fieldErrorProps(error)}
          value={value === undefined || value === '' ? NaN : Number(value)}
          onChange={n => onChange(Number.isNaN(n) ? '' : String(n))}
        />
      </Box>
    );
  }

  if (kind === 'json') {
    return (
      <Box mb="4" {...blurProps}>
        <TextAreaField
          label={label}
          description={helperText}
          isRequired={field.required}
          {...fieldErrorProps(error)}
          rows={3}
          placeholder="{ }"
          value={(value as string | undefined) ?? ''}
          onChange={v => onChange(v)}
        />
      </Box>
    );
  }

  return (
    <Box mb="4" {...blurProps}>
      <TextField
        label={label}
        description={helperText}
        isRequired={field.required}
        {...fieldErrorProps(error)}
        value={(value as string | undefined) ?? ''}
        onChange={v => onChange(v)}
      />
    </Box>
  );
}
