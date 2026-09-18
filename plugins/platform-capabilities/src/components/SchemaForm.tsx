import { useState } from 'react';
import { Flex, Select, Text, TextField } from '@backstage/ui';
import {
  displayValue,
  Field,
  getAt,
  Group,
  parseValue,
  setAt,
  Values,
} from '../lib/schemaForm';

const BOOLEAN_OPTIONS = [
  { value: 'true', label: 'yes' },
  { value: 'false', label: 'no' },
];

export interface SchemaFormProps {
  form: Group;
  values: Values;
  onChange: (values: Values) => void;
  isDisabled?: boolean;
}

function FieldInput({
  field,
  values,
  onChange,
  isDisabled,
}: SchemaFormProps & { field: Field }) {
  // The input keeps what the person typed (a trailing comma, a half-typed
  // number); the form holds the typed value parsed from it.
  const [text, setText] = useState(() =>
    displayValue(field, getAt(values, field.path)),
  );
  const set = (input: string) => {
    setText(input);
    onChange(setAt(values, field.path, parseValue(field, input)));
  };
  const label = field.title;
  if (field.kind === 'enum' || field.kind === 'boolean') {
    const options =
      field.kind === 'boolean'
        ? BOOLEAN_OPTIONS
        : (field.options ?? []).map(value => ({ value, label: value }));
    return (
      <Select
        name={field.name}
        label={label}
        description={field.description}
        isRequired={field.required}
        isDisabled={isDisabled}
        placeholder="Choose…"
        options={options}
        selectedKey={text === '' ? null : text}
        onSelectionChange={key => set(key === null ? '' : String(key))}
      />
    );
  }
  return (
    <TextField
      name={field.name}
      label={label}
      description={
        field.kind === 'strings'
          ? [field.description, 'Comma-separated.'].filter(Boolean).join(' ')
          : field.description
      }
      isRequired={field.required}
      isDisabled={isDisabled}
      value={text}
      onChange={set}
    />
  );
}

function GroupFields(props: SchemaFormProps & { group: Group }) {
  const { group } = props;
  return (
    <Flex
      direction="column"
      gap="3"
      data-testid={`group-${group.path.join('.') || 'root'}`}
    >
      {group.path.length > 0 && (
        <div>
          <Text variant="body-medium" weight="bold">
            {group.title}
          </Text>
          {group.description && (
            <Text variant="body-small" color="secondary">
              {group.description}
            </Text>
          )}
        </div>
      )}
      {group.fields.map(field => (
        <FieldInput key={field.name} {...props} field={field} />
      ))}
      {group.groups.map(child => (
        <GroupFields key={child.path.join('.')} {...props} group={child} />
      ))}
    </Flex>
  );
}

/**
 * The inputs form a definition's JSON schema describes: a field per leaf, a
 * heading per nested object, in the schema's order. A choice (an enum, a
 * boolean) is a select with nothing preselected; a field left empty is left
 * out of the inputs. The schema decides what is asked, the manager decides
 * what is accepted -- the form composes nothing.
 */
export function SchemaForm(props: SchemaFormProps) {
  return <GroupFields {...props} group={props.form} />;
}
