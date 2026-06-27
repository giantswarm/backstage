import { buildArgs, fieldKind, schemaFields } from './schemaForm';

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
