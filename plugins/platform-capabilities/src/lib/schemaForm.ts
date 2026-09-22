import { JsonSchema } from '../apis';

/**
 * The form a definition's JSON schema describes: every leaf of the schema is
 * a field at its path, every nested object a group. The schema decides what
 * is asked -- the leaves marked `x-source: person`, the rest the manager
 * reads or generates -- and the form asks it and chooses nothing for the
 * person: a boolean is a choice between yes and no with neither preselected,
 * a default is shown next to the field and never submitted, and a field
 * left empty is left out of the inputs so the manager reads the record's
 * value or refuses a required choice, as its schema says.
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

/** `modelServing` as `Model serving`. */
function humanise(key: string): string {
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The form of a schema: its groups and fields, in the schema's order. */
export function formOf(schema: JsonSchema, path: string[] = []): Group {
  const key = path[path.length - 1];
  const group: Group = {
    path,
    title: schema.title ?? (key === undefined ? '' : humanise(key)),
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

/**
 * The part of the form that is asked: the fields marked `x-source: person`
 * and the groups holding one; the leaves the manager reads from the registry
 * or generates are not a person's to type.
 */
export function personForm(group: Group): Group {
  const groups = group.groups.map(personForm).filter(hasFields);
  return {
    ...group,
    fields: group.fields.filter(f => f.source === 'person'),
    groups,
  };
}

function hasFields(group: Group): boolean {
  return group.fields.length > 0 || group.groups.length > 0;
}

/** The choices a person makes: the schema's leaves marked `x-source: person`. */
export function personChoices(schema: JsonSchema): Field[] {
  return fieldsOf(personForm(formOf(schema)));
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

/** A name's label on its own: its field's, or its key humanised where no field carries it. */
function leafLabel(name: string, fields: Field[]): string {
  const field = fields.find(c => c.name === name);
  return field ? choiceLabel(field) : humanise(name.split('.').pop() ?? name);
}

/**
 * What a field is called on the page among the fields of one definition --
 * the form's label, the name of a choice the manager lists as not on
 * record: its label, qualified with its group where another field, or
 * another of the names shown beside it (`among`: the record's rows),
 * shares it (Grafana domain next to Portal domain), so no two rows read
 * alike. A name no field carries -- a list of objects such as the portal's
 * friendly labels, a leaf the manager reads itself, or a field the schema
 * does not know -- is named by its key the same way (Friendly labels).
 */
export function labelOf(
  name: string,
  fields: Field[],
  among: readonly string[] = [],
): string {
  const path = name.split('.');
  const label = leafLabel(name, fields);
  if (path.length < 2) {
    return label;
  }
  const others = new Set([...fields.map(f => f.name), ...among]);
  others.delete(name);
  const shared = [...others].some(other => leafLabel(other, fields) === label);
  if (!shared) {
    return label;
  }
  const group = humanise(path[path.length - 2]);
  return `${group} ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
}

/** A choice's value as one word: `on`/`off` for a switch, else the value. */
export function choiceValue(field: Field, value: unknown): string {
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
 * The form's starting values: what is on record for its fields -- the
 * comparison's inputs, every choice read back from the files -- and nothing
 * else. A schema default is not a value on record; the form shows it next
 * to the empty field and the manager applies it.
 */
export function initialValues(form: Group, onRecord: Values = {}): Values {
  let values: Values = {};
  for (const field of fieldsOf(form)) {
    const recorded = getAt(onRecord, field.path);
    if (recorded !== undefined && recorded !== null) {
      values = setAt(values, field.path, recorded);
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

/** The required fields the form has no value for yet, in the form's order. */
export function missingRequired(form: Group, values: Values): Field[] {
  return fieldsOf(form).filter(
    f => f.required && getAt(values, f.path) === undefined,
  );
}

/** `text` as a regular expression matching it literally. */
function literal(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The fields whose key the text names, as the manager's sentences name them
 * -- "the portal's hostname (portal.domain) is not on record" -- the key as
 * a whole: `portal.domain` names neither `portal.domainAlias` nor
 * `portal.domain.tls`, and a full stop after it does not matter.
 */
export function fieldsNamed(text: string, fields: Field[]): Field[] {
  return fields.filter(f =>
    new RegExp(`(?:^|[^\\w.])${literal(f.name)}(?!\\w|\\.\\w)`).test(text),
  );
}

/** The group at `path` in the form, none where the schema has no object there. */
function groupAt(form: Group, path: string[]): Group | undefined {
  return path.reduce<Group | undefined>(
    (group, key) => group?.groups.find(g => g.path[g.path.length - 1] === key),
    form,
  );
}

/**
 * What a choice is about, for the line under its value on the record: the
 * field's own description, else -- where the choice is named after its
 * group, `modelServing.enabled` being the choice "Model serving" -- the
 * group's.
 */
export function choiceDescription(
  field: Field,
  form: Group,
): string | undefined {
  if (field.description) {
    return field.description;
  }
  const key = field.path[field.path.length - 1];
  if (field.title !== key || key !== 'enabled' || field.path.length < 2) {
    return undefined;
  }
  return groupAt(form, field.path.slice(0, -1))?.description;
}
