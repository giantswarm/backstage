import { parseJsonDefinition } from './definitionParsers';

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
