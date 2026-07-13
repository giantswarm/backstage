import { JsonSchema } from '../apis';

/**
 * A single editable argument derived from a tool's JSON-schema `inputSchema`.
 * The explorer renders one widget per field and coerces the raw value back to
 * the declared type before calling the tool.
 *
 * ponytail: object-valued args still fall back to a raw-JSON textarea rather
 * than an expanded sub-form, and arrays of objects do the same. Primitive
 * arrays (string/number/boolean/enum items) get editable rows. Upgrade path:
 * RJSF (react-jsonschema-form) once deeply nested args appear.
 */
export interface SchemaField {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  default?: unknown;
  enumValues?: unknown[];
  /** For arrays: the declared item type (string/number/integer/boolean). */
  itemType?: string;
  /** For arrays of enums: the allowed item values. */
  itemEnumValues?: unknown[];
}

/** The kind of widget a field renders as. */
export type FieldKind =
  'boolean' | 'enum' | 'json' | 'number' | 'array' | 'text';

/** A form value: scalar text/boolean, or a list of row strings for arrays. */
export type FormValue = string | boolean | string[];

const PRIMITIVE_ITEM_TYPES = ['string', 'number', 'integer', 'boolean'];

function normalizeType(type: JsonSchema['type']): string {
  if (Array.isArray(type)) {
    return (type.find(t => t !== 'null') ?? type[0] ?? 'string').toLowerCase();
  }
  return (type ?? 'string').toLowerCase();
}

/** True when an array field's items are simple enough for editable rows. */
function isPrimitiveArray(field: SchemaField): boolean {
  if (field.type !== 'array') {
    return false;
  }
  if (field.itemEnumValues && field.itemEnumValues.length > 0) {
    return true;
  }
  return Boolean(
    field.itemType && PRIMITIVE_ITEM_TYPES.includes(field.itemType),
  );
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
    case 'array':
      return isPrimitiveArray(field) ? 'array' : 'json';
    case 'object':
      return 'json';
    default:
      return 'text';
  }
}

/**
 * Seed initial form values from each enum/select field's schema `default`, so
 * the widget shows the value the tool will actually use instead of rendering
 * blank. Only enum fields are seeded: scalar defaults are surfaced as helper
 * text and a blank optional field is still omitted (the tool applies its own
 * default), so seeding them would only add redundant payload.
 */
export function enumDefaults(fields: SchemaField[]): Record<string, FormValue> {
  const out: Record<string, FormValue> = {};
  for (const field of fields) {
    if (fieldKind(field) === 'enum' && field.default !== undefined) {
      out[field.name] = String(field.default);
    }
  }
  return out;
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
    itemType: prop.items ? normalizeType(prop.items.type) : undefined,
    itemEnumValues: prop.items?.enum,
  }));
}

function coerceScalar(
  type: string,
  text: string,
): { value: unknown } | { error: string } {
  if (type === 'number' || type === 'integer') {
    const num = Number(text);
    if (Number.isNaN(num)) {
      return { error: 'must be a number' };
    }
    return { value: num };
  }
  if (type === 'boolean') {
    return { value: text === 'true' };
  }
  return { value: text };
}

/**
 * Coerce a raw form value to the type its field declares. Returns the coerced
 * value, or an error message when the input can't be parsed. An empty text-like
 * input yields `undefined` (the field is omitted so the tool's own default
 * applies).
 */
export function coerceValue(
  field: SchemaField,
  raw: FormValue,
): { value: unknown } | { error: string } {
  const kind = fieldKind(field);
  if (kind === 'boolean') {
    return { value: Boolean(raw) };
  }

  if (kind === 'array') {
    // Editable rows arrive as an array of strings; a JSON-paste fallback
    // arrives as a single string holding a JSON array.
    if (Array.isArray(raw)) {
      const itemType = field.itemType ?? 'string';
      const out: unknown[] = [];
      for (const row of raw) {
        const text = String(row).trim();
        if (text === '') {
          continue;
        }
        const coerced = coerceScalar(itemType, text);
        if ('error' in coerced) {
          return { error: `item ${coerced.error}` };
        }
        out.push(coerced.value);
      }
      return { value: out.length === 0 ? undefined : out };
    }
    const text = String(raw).trim();
    if (text === '') {
      return { value: undefined };
    }
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        return { error: 'must be a JSON array' };
      }
      return { value: parsed };
    } catch {
      return { error: 'must be valid JSON' };
    }
  }

  const text = String(raw).trim();
  if (text === '') {
    return { value: undefined };
  }
  if (kind === 'number') {
    return coerceScalar('number', text);
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
  values: Record<string, FormValue>,
): BuildArgsResult {
  const args: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  for (const field of fields) {
    if (fieldKind(field) === 'boolean') {
      args[field.name] = Boolean(values[field.name] ?? field.default ?? false);
      continue;
    }
    const raw = values[field.name] ?? (fieldKind(field) === 'array' ? [] : '');
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
