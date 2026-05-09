import { frontendTools } from './frontendTools';

describe('frontendTools', () => {
  it('returns an empty object when tools is undefined', () => {
    expect(frontendTools(undefined)).toEqual({});
  });

  it('returns an empty object when tools is null', () => {
    expect(frontendTools(null)).toEqual({});
  });

  it('returns an empty object when tools is empty', () => {
    expect(frontendTools({})).toEqual({});
  });

  it('converts tool entries and preserves descriptions', () => {
    const result = frontendTools({
      foo: {
        description: 'foo tool',
        parameters: { type: 'object', properties: {} },
      },
      bar: {
        parameters: { type: 'object', properties: {} },
      },
    });

    expect(Object.keys(result).sort()).toEqual(['bar', 'foo']);
    expect(result.foo.description).toBe('foo tool');
    expect(result.bar).not.toHaveProperty('description');
    expect(result.foo.inputSchema).toBeDefined();
    expect(result.bar.inputSchema).toBeDefined();
  });
});
