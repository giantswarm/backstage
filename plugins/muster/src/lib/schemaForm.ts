import { JsonSchema } from '../apis';

/**
 * A single editable argument derived from a tool's JSON-schema `inputSchema`.
 * The explorer renders one input per field and coerces the raw value back to
 * the declared type before calling the tool.
 *
 * ponytail: flat object schemas only (string/number/integer/boolean/enum, plus
 * a JSON textarea fallback for object/array). Nested object properties are not
 * expanded into sub-forms — they fall back to the raw-JSON field. Upgrade path:
 * RJSF (react-jsonschema-form) once nested/array-of-object args appear.
 */
export interface SchemaField {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  default?: unknown;
  enumValues?: unknown[];
}

/** The kind of widget a field renders as. */
export type FieldKind = 'boolean' | 'enum' | 'json' | 'number' | 'text';

function normalizeType(type: JsonSchema['type']): string {
  if (Array.isArray(type)) {
    return (type.find(t => t !== 'null') ?? type[0] ?? 'string').toLowerCase();
  }
  return (type ?? 'string').toLowerCase();
}

export function fieldKind(field: SchemaField): FieldKind {
  if (field.enumValues && field.enumValues.length > 0) {
    return 'enum';
  }
  switch (field.type) {
    case 'boolean':
      return 'boolean';
    case 'number':
    case 'integer':
      return 'number';
    case 'object':
    case 'array':
      return 'json';
    default:
      return 'text';
  }
}

/** Flatten an object input schema into an ordered list of editable fields. */
export function schemaFields(schema?: JsonSchema): SchemaField[] {
  const properties = schema?.properties;
  if (!properties) {
    return [];
  }
  const required = new Set(schema?.required ?? []);
  return Object.entries(properties).map(([name, prop]) => ({
    name,
    type: normalizeType(prop.type),
    required: required.has(name),
    description: prop.description,
    default: prop.default,
    enumValues: prop.enum,
  }));
}

/**
 * Coerce a raw form value to the type its field declares. Returns the coerced
 * value, or an error message when the input can't be parsed. An empty text-like
 * input yields `undefined` (the field is omitted so the tool's own default
 * applies).
 */
export function coerceValue(
  field: SchemaField,
  raw: string | boolean,
): { value: unknown } | { error: string } {
  const kind = fieldKind(field);
  if (kind === 'boolean') {
    return { value: Boolean(raw) };
  }
  const text = String(raw).trim();
  if (text === '') {
    return { value: undefined };
  }
  if (kind === 'number') {
    const num = Number(text);
    if (Number.isNaN(num)) {
      return { error: 'must be a number' };
    }
    return { value: num };
  }
  if (kind === 'json') {
    try {
      return { value: JSON.parse(text) };
    } catch {
      return { error: 'must be valid JSON' };
    }
  }
  return { value: text };
}

export interface BuildArgsResult {
  args: Record<string, unknown>;
  errors: Record<string, string>;
}

/**
 * Build the `arguments` object for `call_tool` from the current form values,
 * validating required fields. Booleans always carry a value; blank optional
 * fields are dropped.
 */
export function buildArgs(
  fields: SchemaField[],
  values: Record<string, string | boolean>,
): BuildArgsResult {
  const args: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  for (const field of fields) {
    if (fieldKind(field) === 'boolean') {
      args[field.name] = Boolean(values[field.name] ?? field.default ?? false);
      continue;
    }
    const raw = (values[field.name] as string | undefined) ?? '';
    const result = coerceValue(field, raw);
    if ('error' in result) {
      errors[field.name] = result.error;
      continue;
    }
    if (result.value === undefined) {
      if (field.required && field.default === undefined) {
        errors[field.name] = 'required';
      }
      continue;
    }
    args[field.name] = result.value;
  }

  return { args, errors };
}
