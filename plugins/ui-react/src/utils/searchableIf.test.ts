import { SEARCH_MIN } from '../components/ShowMore/ShowMore';
import { searchableIf } from './searchableIf';

describe('searchableIf', () => {
  it('leaves one or two options without a search', () => {
    expect(SEARCH_MIN).toBe(3);
    expect(searchableIf([])).toBe(false);
    expect(searchableIf(['a', 'b'])).toBe(false);
  });

  it('offers a search from SEARCH_MIN options on', () => {
    expect(searchableIf(['a', 'b', 'c'])).toBe(true);
    expect(searchableIf(Array.from({ length: 300 }))).toBe(true);
  });
});
