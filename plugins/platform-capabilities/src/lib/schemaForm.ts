import { JsonSchema } from '../apis';

/**
 * The form a definition's JSON schema describes: every leaf of the schema is
 * a field at its path, every nested object a group. The schema decides what
 * is asked; the form asks it and chooses nothing for the person -- a
 * boolean is a choice between yes and no with neither preselected, and a
 * field left empty is left out of the inputs so the manager reads the
 * record's value or refuses a required choice, as its schema says.
 */
export type FieldKind = 'string' | 'number' | 'boolean' | 'enum' | 'strings';

export interface Field {
  /** The leaf's path in the inputs object, e.g. `['kagent', 'enabled']`. */
  path: string[];
  /** The dotted path, the field's id and name in the form. */
  name: string;
  title: string;
  description?: string;
  kind: FieldKind;
  required: boolean;
  /** The choices of an `enum` field, as strings. */
  options?: string[];
  /** The schema's `x-source`: `person` marks a choice the person makes. */
  source?: string;
  /** The schema's default, what an unmade choice comes to. */
  default?: unknown;
}

export interface Group {
  path: string[];
  title: string;
  description?: string;
  fields: Field[];
  groups: Group[];
}

export type Values = Record<string, unknown>;

function typeOf(schema: JsonSchema): string | undefined {
  const type = Array.isArray(schema.type)
    ? schema.type.find(t => t !== 'null')
    : schema.type;
  return type ?? (schema.properties ? 'object' : undefined);
}

function kindOf(schema: JsonSchema): FieldKind | undefined {
  if (schema.enum) {
    return 'enum';
  }
  switch (typeOf(schema)) {
    case 'string':
      return 'string';
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'array':
      return typeOf(schema.items ?? {}) === 'string' ? 'strings' : undefined;
    default:
      return undefined;
  }
}

/** The form of a schema: its groups and fields, in the schema's order. */
export function formOf(schema: JsonSchema, path: string[] = []): Group {
  const group: Group = {
    path,
    title: schema.title ?? path[path.length - 1] ?? '',
    description: schema.description,
    fields: [],
    groups: [],
  };
  const required = new Set(schema.required ?? []);
  for (const [name, property] of Object.entries(schema.properties ?? {})) {
    const fieldPath = [...path, name];
    if (typeOf(property) === 'object') {
      group.groups.push(formOf(property, fieldPath));
      continue;
    }
    const kind = kindOf(property);
    if (!kind) {
      continue;
    }
    group.fields.push({
      path: fieldPath,
      name: fieldPath.join('.'),
      title: property.title ?? name,
      description: property.description,
      kind,
      required: required.has(name),
      options: property.enum?.map(String),
      source: property['x-source'],
      default: property.default,
    });
  }
  return group;
}

/** Every field of the form, groups flattened, in order. */
export function fieldsOf(group: Group): Field[] {
  return [...group.fields, ...group.groups.flatMap(fieldsOf)];
}

/** The choices a person makes: the schema's leaves marked `x-source: person`. */
export function personChoices(schema: JsonSchema): Field[] {
  return fieldsOf(formOf(schema)).filter(f => f.source === 'person');
}

/** `modelServing` as `Model serving`. */
function humanise(key: string): string {
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * What a choice is called on the page: the schema's title, else its key --
 * `modelServing.enabled` is the choice "Model serving", the `enabled` leaf
 * being the switch, not the name.
 */
export function choiceLabel(field: Field): string {
  const key = field.path[field.path.length - 1];
  if (field.title !== key) {
    return field.title;
  }
  const named =
    key === 'enabled' && field.path.length > 1
      ? field.path[field.path.length - 2]
      : key;
  return humanise(named);
}

/** A choice's value as one word: `on`/`off` for a switch, `not chosen` for none, else the value. */
export function choiceValue(field: Field, value: unknown): string {
  if (value === undefined || value === null) {
    return 'not chosen';
  }
  if (field.kind === 'boolean') {
    return value ? 'on' : 'off';
  }
  return displayValue(field, value);
}

export function getAt(values: Values, path: string[]): unknown {
  let current: unknown = values;
  for (const key of path) {
    if (typeof current !== 'object' || current === null) {
      return undefined;
    }
    current = (current as Values)[key];
  }
  return current;
}

/** A copy of `values` with the leaf at `path` set (or removed for `undefined`), empty groups pruned. */
export function setAt(values: Values, path: string[], value: unknown): Values {
  if (path.length === 0) {
    return values;
  }
  const [key, ...rest] = path;
  const next = { ...values };
  if (rest.length === 0) {
    if (value === undefined) {
      delete next[key];
    } else {
      next[key] = value;
    }
  } else {
    const child = setAt((next[key] as Values) ?? {}, rest, value);
    if (Object.keys(child).length === 0) {
      delete next[key];
    } else {
      next[key] = child;
    }
  }
  return next;
}

/**
 * The form's starting values: the schema's defaults, then the values on
 * record (the installation's record under `installation`, the inputs of the
 * last action) where the schema has a field for them.
 */
export function initialValues(
  form: Group,
  schema: JsonSchema,
  onRecord: Values = {},
): Values {
  let values: Values = {};
  for (const field of fieldsOf(form)) {
    const property = getAt(
      schema as unknown as Values,
      field.path.flatMap(key => ['properties', key]),
    ) as JsonSchema | undefined;
    const recorded = getAt(onRecord, field.path);
    const value = recorded ?? property?.default;
    if (value !== undefined && value !== null) {
      values = setAt(values, field.path, value);
    }
  }
  return values;
}

/** A field's value as the form shows it: text for the input, or a select key. */
export function displayValue(field: Field, value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (field.kind === 'strings' && Array.isArray(value)) {
    return value.join(', ');
  }
  return String(value);
}

/** The typed value of what the person entered; `undefined` leaves the field out. */
export function parseValue(field: Field, text: string): unknown {
  const trimmed = text.trim();
  if (trimmed === '') {
    return undefined;
  }
  switch (field.kind) {
    case 'boolean':
      return trimmed === 'true';
    case 'number': {
      const n = Number(trimmed);
      return Number.isFinite(n) ? n : undefined;
    }
    case 'strings':
      return trimmed
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
    default:
      return trimmed;
  }
}

/** The required fields the form has no value for yet, by dotted name. */
export function missingRequired(form: Group, values: Values): string[] {
  return fieldsOf(form)
    .filter(f => f.required && getAt(values, f.path) === undefined)
    .map(f => f.name);
}
