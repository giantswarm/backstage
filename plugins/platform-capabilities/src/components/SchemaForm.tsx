import { useId, useMemo, useState } from 'react';
import { Flex, Select, Text, TextField } from '@backstage/ui';
import { SectionHeader } from '@giantswarm/backstage-plugin-ui-react';
import {
  displayValue,
  Field,
  fieldsOf,
  getAt,
  Group,
  labelOf,
  parseValue,
  setAt,
  Values,
} from '../lib/schemaForm';

const BOOLEAN_OPTIONS = [
  { value: 'true', label: 'yes' },
  { value: 'false', label: 'no' },
];

/** What a required field without a value says under itself. */
export const REQUIRED_MESSAGE = 'Required, not chosen yet.';

export interface SchemaFormProps {
  /** The asked part of the definition's form (`personForm`). */
  form: Group;
  values: Values;
  onChange: (values: Values) => void;
  isDisabled?: boolean;
}

/** Every field's label, qualified where two fields of the form share one. */
export function labelsOf(form: Group): Map<string, string> {
  const fields = fieldsOf(form);
  return new Map(fields.map(f => [f.name, labelOf(f.name, fields)]));
}

/** A value as the field's control shows it: `yes`/`no` for a switch, else the text. */
function optionLabel(field: Field, value: unknown): string {
  if (field.kind === 'boolean') {
    return value ? 'yes' : 'no';
  }
  return displayValue(field, value);
}

/**
 * The schema's default as the empty field's placeholder, marked as the
 * default: what the manager applies where the person chooses nothing, never
 * a value the form submits.
 */
function placeholderOf(field: Field): string | undefined {
  if (field.default === undefined || field.default === null) {
    return undefined;
  }
  return `${optionLabel(field, field.default)} (default)`;
}

interface FieldInputProps extends SchemaFormProps {
  field: Field;
  label: string;
  description?: string;
}

function FieldInput({
  field,
  label,
  description,
  values,
  onChange,
  isDisabled,
}: FieldInputProps) {
  // The input keeps what the person typed (a trailing comma, a half-typed
  // number); the form holds the typed value parsed from it.
  const [text, setText] = useState(() =>
    displayValue(field, getAt(values, field.path)),
  );
  const set = (input: string) => {
    setText(input);
    onChange(setAt(values, field.path, parseValue(field, input)));
  };
  // A required field without a value is marked on the field itself, as
  // soon as the form opens, with the form's own line under it.
  const missing = field.required && getAt(values, field.path) === undefined;
  const errorId = useId();
  const control =
    field.kind === 'enum' || field.kind === 'boolean' ? (
      <Select
        name={field.name}
        label={label}
        description={description}
        isRequired={field.required}
        isDisabled={isDisabled}
        placeholder={placeholderOf(field) ?? 'Choose…'}
        options={
          field.kind === 'boolean'
            ? BOOLEAN_OPTIONS
            : (field.options ?? []).map(value => ({ value, label: value }))
        }
        selectedKey={text === '' ? null : text}
        onSelectionChange={key => set(key === null ? '' : String(key))}
        isInvalid={missing}
        aria-describedby={missing ? errorId : undefined}
      />
    ) : (
      <TextField
        name={field.name}
        label={label}
        description={
          field.kind === 'strings'
            ? [description, 'Comma-separated.'].filter(Boolean).join(' ')
            : description
        }
        isRequired={field.required}
        isDisabled={isDisabled}
        placeholder={placeholderOf(field)}
        value={text}
        onChange={set}
        isInvalid={missing}
        aria-describedby={missing ? errorId : undefined}
      />
    );
  return (
    <div data-field={field.name}>
      {control}
      {missing && (
        <Text
          id={errorId}
          variant="body-small"
          color="danger"
          data-testid="field-error"
        >
          {REQUIRED_MESSAGE}
        </Text>
      )}
    </div>
  );
}

function GroupFields(
  props: SchemaFormProps & { group: Group; labels: Map<string, string> },
) {
  const { group, labels } = props;
  const depth = group.path.length;
  // A group of one switch that is named after it (grafana with its enabled)
  // is the field: a heading of its own would say the name twice.
  const lone =
    group.fields.length === 1 &&
    group.groups.length === 0 &&
    labels.get(group.fields[0].name) === group.title;
  return (
    <Flex
      direction="column"
      gap="3"
      data-testid={`group-${group.path.join('.') || 'root'}`}
    >
      {depth > 0 && !lone && (
        <SectionHeader
          as={depth > 1 ? 'h4' : 'h3'}
          variant={depth > 1 ? 'title-x-small' : 'title-small'}
          title={group.title}
          description={group.description}
        />
      )}
      {group.fields.map(field => (
        <FieldInput
          key={field.name}
          {...props}
          field={field}
          label={labels.get(field.name) ?? field.title}
          description={
            lone ? (field.description ?? group.description) : field.description
          }
        />
      ))}
      {group.groups.map(child => (
        <GroupFields key={child.path.join('.')} {...props} group={child} />
      ))}
    </Flex>
  );
}

/**
 * The inputs form a definition's JSON schema describes, the person's part of
 * it: a field per choice the definition leaves to a person, a heading per
 * group of them, in the schema's order. A choice (an enum, a boolean) is a
 * select with nothing preselected; a schema default is the empty field's
 * placeholder, marked as the default; a field left empty is left out of the
 * inputs; a required field without a value is marked on the field. Labels
 * are the schema's titles, else the keys in words, qualified with the group
 * where two fields share one. The schema decides what is asked, the manager
 * decides what is accepted -- the form composes nothing.
 */
export function SchemaForm(props: SchemaFormProps) {
  const labels = useMemo(() => labelsOf(props.form), [props.form]);
  return <GroupFields {...props} group={props.form} labels={labels} />;
}
