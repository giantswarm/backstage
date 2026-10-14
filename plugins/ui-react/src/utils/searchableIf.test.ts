import { SEARCH_MIN } from '../components/ShowMore/ShowMore';
import { searchableIf } from './searchableIf';

describe('searchableIf', () => {
  it('leaves a short list of options without a search', () => {
    expect(searchableIf([])).toBe(false);
    expect(searchableIf(['a', 'b', 'c'])).toBe(false);
    expect(searchableIf(Array.from({ length: SEARCH_MIN }))).toBe(false);
  });

  it('offers a search once there are more options than SEARCH_MIN', () => {
    expect(searchableIf(Array.from({ length: SEARCH_MIN + 1 }))).toBe(true);
    expect(searchableIf(Array.from({ length: 300 }))).toBe(true);
  });
});
