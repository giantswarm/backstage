import { slugify } from './slugify';

describe('slugify', () => {
  it('turns a free-form name into a DNS label', () => {
    expect(slugify(' -My_Workspace!- ')).toBe('my-workspace');
  });

  it('cuts at the length given, with no dash at the end', () => {
    expect(slugify(`${'a'.repeat(39)} b`, 40)).toBe('a'.repeat(39));
    expect(slugify('x'.repeat(70))).toHaveLength(63);
  });
});
