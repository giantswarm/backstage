import { generateUID } from './generateUID';

describe('generateUID', () => {
  it('generates unique IDs', () => {
    const tries = 250;
    const minLength = 3;
    const maxLength = 10;

    const values = new Set<string>();
    for (let i = 0; i < tries; i++) {
      const randomLength = Math.floor(minLength + maxLength * Math.random());
      const id = generateUID(randomLength);

      expect(id).toHaveLength(randomLength);
      expect(values.has(id)).toBeFalsy();

      values.add(id);
    }
  });

  it('throws an error if the length parameter is incorrect', () => {
    expect(() => generateUID(2)).toThrow('Length is too short');
  });
});
