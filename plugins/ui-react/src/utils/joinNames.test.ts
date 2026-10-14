import { groupNames, joinNames, NAMED_IN_SENTENCE } from './joinNames';

const names = (count: number) =>
  Array.from({ length: count }, (_, index) => `inst-${index + 1}`);

describe('joinNames', () => {
  it('names every entry of a short list', () => {
    expect(joinNames([])).toBe('');
    expect(joinNames(['a'])).toBe('a');
    expect(joinNames(['a', 'b', 'c'])).toBe('a, b, c');
    expect(joinNames(names(NAMED_IN_SENTENCE))).toBe(
      'inst-1, inst-2, inst-3, inst-4, inst-5',
    );
  });

  it('names the first five and counts the rest', () => {
    expect(joinNames(names(6))).toBe(
      'inst-1, inst-2, inst-3, inst-4, inst-5 and 1 more',
    );
    expect(joinNames(names(300))).toBe(
      'inst-1, inst-2, inst-3, inst-4, inst-5 and 295 more',
    );
  });

  it('takes a different cap and separator', () => {
    expect(joinNames(['a', 'b', 'c'], { max: 2 })).toBe('a, b and 1 more');
    expect(joinNames(['a: x', 'b: y'], { separator: '; ' })).toBe('a: x; b: y');
  });
});

describe('groupNames', () => {
  it('groups names by label in the order first seen', () => {
    const entries = [
      { name: 'a', reason: 'timed out' },
      { name: 'b', reason: 'permission denied' },
      { name: 'c', reason: 'timed out' },
    ];
    expect(
      groupNames(
        entries,
        entry => entry.name,
        entry => entry.reason,
      ),
    ).toEqual([
      { group: 'timed out', names: ['a', 'c'] },
      { group: 'permission denied', names: ['b'] },
    ]);
  });

  it('returns no groups for no entries', () => {
    expect(
      groupNames(
        [] as string[],
        name => name,
        () => '',
      ),
    ).toEqual([]);
  });
});
