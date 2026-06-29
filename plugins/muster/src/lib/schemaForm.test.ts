import {
  buildArgs,
  enumDefaults,
  fieldKind,
  schemaFields,
} from './schemaForm';

describe('schemaFields', () => {
  it('flattens an object schema and marks required fields', () => {
    const fields = schemaFields({
      type: 'object',
      required: ['namespace'],
      properties: {
        namespace: { type: 'string', description: 'target ns' },
        replicas: { type: 'integer', default: 1 },
        dryRun: { type: 'boolean' },
        mode: { type: 'string', enum: ['a', 'b'] },
      },
    });

    expect(fields.map(f => f.name)).toEqual([
      'namespace',
      'replicas',
      'dryRun',
      'mode',
    ]);
    expect(fields[0].required).toBe(true);
    expect(fields[1].required).toBe(false);
    expect(fieldKind(fields[2])).toBe('boolean');
    expect(fieldKind(fields[3])).toBe('enum');
  });

  it('returns no fields for a schema without properties', () => {
    expect(schemaFields(undefined)).toEqual([]);
    expect(schemaFields({ type: 'object' })).toEqual([]);
  });
});

describe('enumDefaults', () => {
  it('seeds only enum fields that declare a default, as strings', () => {
    const fields = schemaFields({
      type: 'object',
      properties: {
        output: { type: 'string', enum: ['slim', 'full'], default: 'slim' },
        priority: { type: 'integer', enum: [1, 2, 3], default: 2 },
        format: { type: 'string', enum: ['json', 'yaml'] },
        replicas: { type: 'integer', default: 1 },
        name: { type: 'string' },
      },
    });

    expect(enumDefaults(fields)).toEqual({ output: 'slim', priority: '2' });
  });

  it('returns nothing when no enum field has a default', () => {
    const fields = schemaFields({
      type: 'object',
      properties: { name: { type: 'string', default: 'x' } },
    });
    expect(enumDefaults(fields)).toEqual({});
  });
});

describe('buildArgs', () => {
  const fields = schemaFields({
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string' },
      count: { type: 'integer' },
      enabled: { type: 'boolean' },
      spec: { type: 'object' },
    },
  });

  it('coerces values by declared type and omits blanks', () => {
    const { args, errors } = buildArgs(fields, {
      name: 'pod',
      count: '3',
      enabled: true,
      spec: '{"a":1}',
    });
    expect(errors).toEqual({});
    expect(args).toEqual({
      name: 'pod',
      count: 3,
      enabled: true,
      spec: { a: 1 },
    });
  });

  it('reports a missing required field', () => {
    const { errors } = buildArgs(fields, { count: '3' });
    expect(errors.name).toBe('required');
  });

  it('reports an unparseable number and invalid JSON', () => {
    const { errors } = buildArgs(fields, {
      name: 'pod',
      count: 'abc',
      spec: 'not json',
    });
    expect(errors.count).toBe('must be a number');
    expect(errors.spec).toBe('must be valid JSON');
  });

  it('always sends a boolean even when left at its default', () => {
    const { args } = buildArgs(fields, { name: 'pod' });
    expect(args.enabled).toBe(false);
  });
});

describe('array fields', () => {
  const fields = schemaFields({
    type: 'object',
    required: ['labels'],
    properties: {
      labels: { type: 'array', items: { type: 'string' } },
      ports: { type: 'array', items: { type: 'integer' } },
      objs: { type: 'array', items: { type: 'object' } },
    },
  });

  it('classifies primitive arrays as editable rows and object arrays as json', () => {
    expect(fieldKind(fields[0])).toBe('array');
    expect(fieldKind(fields[1])).toBe('array');
    expect(fieldKind(fields[2])).toBe('json');
  });

  it('builds a primitive array from rows, dropping blanks and coercing items', () => {
    const { args, errors } = buildArgs(fields, {
      labels: ['a', '', 'b'],
      ports: ['80', '443'],
      objs: '[{"x":1}]',
    });
    expect(errors).toEqual({});
    expect(args.labels).toEqual(['a', 'b']);
    expect(args.ports).toEqual([80, 443]);
    expect(args.objs).toEqual([{ x: 1 }]);
  });

  it('accepts a JSON-array string fallback for a primitive array', () => {
    const { args, errors } = buildArgs(fields, {
      labels: '["x","y"]',
    });
    expect(errors.labels).toBeUndefined();
    expect(args.labels).toEqual(['x', 'y']);
  });

  it('reports a required array left empty and a non-array JSON fallback', () => {
    expect(buildArgs(fields, { labels: [] }).errors.labels).toBe('required');
    expect(buildArgs(fields, { labels: '{"a":1}' }).errors.labels).toBe(
      'must be a JSON array',
    );
  });
});
