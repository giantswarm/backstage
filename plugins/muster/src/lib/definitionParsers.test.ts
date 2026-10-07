import { parseJsonDefinition, parseYamlDefinition } from './definitionParsers';

describe('parseJsonDefinition', () => {
  it('parses a JSON object', () => {
    expect(parseJsonDefinition('{"name":"a","url":"https://x"}')).toEqual({
      name: 'a',
      url: 'https://x',
    });
  });

  it.each(['', 'not json', '{"name":'])('rejects %j as invalid JSON', value => {
    expect(() => parseJsonDefinition(value)).toThrow(/^Invalid JSON: /);
  });
});

describe('parseYamlDefinition', () => {
  it('parses a YAML mapping', () => {
    expect(
      parseYamlDefinition('name: deploy\nsteps:\n  - id: s1\n    tool: t\n'),
    ).toEqual({ name: 'deploy', steps: [{ id: 's1', tool: 't' }] });
  });

  it.each([
    ['empty input', ''],
    ['a comment only', '# nothing here\n'],
    ['broken indentation', 'name: a\n  steps: [\n'],
  ])('rejects %s as invalid YAML', (_, value) => {
    expect(() => parseYamlDefinition(value)).toThrow(/^Invalid YAML: /);
  });

  it.each([
    ['a scalar', 'deploy'],
    ['a number', '42'],
    ['a sequence', '- a\n- b\n'],
    ['null', 'null'],
  ])('rejects %s as not a mapping', (_, value) => {
    expect(() => parseYamlDefinition(value)).toThrow(
      'Workflow definition must be a YAML mapping.',
    );
  });
});
