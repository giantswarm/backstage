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
import AddIcon from '@material-ui/icons/Add';
import DeleteOutlineIcon from '@material-ui/icons/DeleteOutline';
import { fieldKind, FormValue, SchemaField } from '../../lib/schemaForm';

function helperFor(field: SchemaField, error?: string): string | undefined {
  if (error) {
    return error;
  }
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
}: {
  label: string;
  itemType?: string;
  enumOptions: { id: string; label: string }[];
  value: string;
  onChange: (next: string) => void;
}) {
  if (enumOptions.length > 0) {
    return (
      <Select
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
        aria-label={label}
        value={value === '' ? NaN : Number(value)}
        onChange={n => onChange(Number.isNaN(n) ? '' : String(n))}
      />
    );
  }
  return (
    <TextField aria-label={label} value={value} onChange={v => onChange(v)} />
  );
}

function ArrayField({
  field,
  value,
  error,
  jsonMode,
  onChange,
  onToggleJson,
}: {
  field: SchemaField;
  value: FormValue | undefined;
  error?: string;
  jsonMode: boolean;
  onChange: (value: FormValue) => void;
  onToggleJson: () => void;
}) {
  const rows = Array.isArray(value) ? value : [];

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
        <Text variant="body-medium">
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
          rows={3}
          placeholder='["a", "b"]'
          isInvalid={Boolean(error)}
          value={typeof value === 'string' ? value : ''}
          onChange={v => onChange(v)}
        />
      ) : (
        <Flex direction="column" gap="2">
          {rows.map((row, index) => (
            <Flex key={index} align="center" gap="2">
              <Box style={{ flexGrow: 1 }}>
                <ArrayItemInput
                  label={`${field.name} item ${index + 1}`}
                  itemType={field.itemType}
                  enumOptions={enumOptions}
                  value={row}
                  onChange={next => setRow(index, next)}
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

      {(error || field.description) && (
        <Text
          variant="body-small"
          color={error ? 'danger' : 'secondary'}
          style={{ display: 'block', marginTop: 4 }}
        >
          {error ?? field.description}
        </Text>
      )}
    </Box>
  );
}

export interface ToolArgFieldProps {
  field: SchemaField;
  value: FormValue | undefined;
  error?: string;
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
  jsonMode,
  onChange,
  onToggleJson,
}: ToolArgFieldProps) {
  const kind = fieldKind(field);

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
      <ArrayField
        field={field}
        value={value}
        error={error}
        jsonMode={jsonMode}
        onChange={onChange}
        onToggleJson={onToggleJson}
      />
    );
  }

  const helperText = helperFor(field, error);
  const label = `${field.name} (${field.type})`;

  if (kind === 'enum') {
    // A leading "unset" entry lets an optional enum be cleared back to empty
    // (react-aria Select has no built-in clear); the sentinel maps to '' so it
    // is dropped from the call payload.
    const UNSET = '__unset__';
    return (
      <Box mb="4">
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
        />
      </Box>
    );
  }

  if (kind === 'number') {
    return (
      <Box mb="4">
        <NumberField
          label={label}
          description={helperText}
          isRequired={field.required}
          isInvalid={Boolean(error)}
          value={value === undefined || value === '' ? NaN : Number(value)}
          onChange={n => onChange(Number.isNaN(n) ? '' : String(n))}
        />
      </Box>
    );
  }

  if (kind === 'json') {
    return (
      <Box mb="4">
        <TextAreaField
          label={label}
          description={helperText}
          isRequired={field.required}
          isInvalid={Boolean(error)}
          rows={3}
          placeholder="{ }"
          value={(value as string | undefined) ?? ''}
          onChange={v => onChange(v)}
        />
      </Box>
    );
  }

  return (
    <Box mb="4">
      <TextField
        label={label}
        description={helperText}
        isRequired={field.required}
        isInvalid={Boolean(error)}
        value={(value as string | undefined) ?? ''}
        onChange={v => onChange(v)}
      />
    </Box>
  );
}
