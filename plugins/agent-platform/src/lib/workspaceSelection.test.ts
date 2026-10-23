import {
  exclusionsOutsidePicks,
  hasFilters,
  keptPicks,
  localSourceCount,
} from './workspaceSelection';

const apps = Array.from({ length: 7 }, (_, i) => `app-${i + 1}`);
const old = Array.from({ length: 8 }, (_, i) => `old-${i + 1}`);

describe('localSourceCount', () => {
  it('counts 7 picks by name as 7 when none of 8 exclusions names one', () => {
    expect(
      localSourceCount({ owner: 'o', repositories: apps, exclude: old }),
    ).toEqual({ total: 7, excluded: 0 });
  });

  it('drops a pick by name that an exclusion names, without case', () => {
    expect(
      localSourceCount({
        owner: 'o',
        repositories: apps,
        exclude: ['APP-1', 'app-2', 'old-1'],
      }),
    ).toEqual({ total: 5, excluded: 2 });
  });

  it('never goes below zero', () => {
    expect(
      localSourceCount({
        owner: 'o',
        repositories: ['a'],
        exclude: ['a', 'b', 'c'],
      }),
    ).toEqual({ total: 0, excluded: 1 });
  });

  it.each([
    { owner: 'o', repositories: ['a'], languages: ['Go'] },
    { owner: 'o', topics: ['mcp'] },
    { owner: 'o', filters: { languages: ['Go'] } },
    { owner: 'o', filters: { topics: { names: ['mcp'] } } },
  ])('leaves a source with filters to the manager: %j', source => {
    expect(hasFilters(source)).toBe(true);
    expect(localSourceCount(source)).toBeUndefined();
  });
});

describe('keptPicks and exclusionsOutsidePicks', () => {
  it('splits the picks and the exclusions by what they name', () => {
    const source = {
      owner: 'o',
      repositories: ['a', 'b'],
      exclude: ['B', 'c'],
    };
    expect(keptPicks(source)).toEqual(['a']);
    expect(exclusionsOutsidePicks(source)).toEqual(['c']);
  });
});
