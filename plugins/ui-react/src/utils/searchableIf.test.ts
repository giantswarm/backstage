import { searchableIf } from './searchableIf';

describe('searchableIf', () => {
  it('leaves a short list of options without a search', () => {
    expect(searchableIf([])).toBe(false);
    expect(searchableIf(['a', 'b', 'c'])).toBe(false);
    expect(searchableIf(Array.from({ length: 8 }))).toBe(false);
  });

  it('offers a search once there are more than eight options', () => {
    expect(searchableIf(Array.from({ length: 9 }))).toBe(true);
    expect(searchableIf(Array.from({ length: 300 }))).toBe(true);
  });
});
