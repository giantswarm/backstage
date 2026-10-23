import { emptySource } from '../../lib/workspaceDraft';
import { countSummary } from './sourceCount';
import { exclusionEffect } from './SourceExclusions';

describe('countSummary', () => {
  const kind = 'github';

  it('adds up a source without filters', () => {
    expect(
      countSummary({
        byName: 7,
        count: { state: 'known', total: 7, excluded: 0 },
        providerKind: kind,
      }),
    ).toBe('7 by name = 7 repositories');
    expect(
      countSummary({
        byName: 7,
        count: { state: 'known', total: 5, excluded: 2 },
        providerKind: kind,
      }),
    ).toBe('7 by name · 2 excluded = 5 repositories');
  });

  it("adds up a filter's matches when the manager's total agrees", () => {
    expect(
      countSummary({
        byFilter: 3,
        byName: 1,
        count: { state: 'known', total: 2, excluded: 2 },
        providerKind: kind,
      }),
    ).toBe('3 by filter · 1 by name · 2 excluded = 2 repositories');
  });

  it('gives the total on its own when a pick is a filter match too', () => {
    expect(
      countSummary({
        byFilter: 3,
        byName: 1,
        count: { state: 'known', total: 3, excluded: 0 },
        providerKind: kind,
      }),
    ).toBe('3 by filter · 1 by name · 3 repositories in all');
  });

  it('says so while the manager counts, or when it cannot', () => {
    expect(
      countSummary({
        byFilter: null,
        byName: 0,
        count: { state: 'counting' },
        providerKind: kind,
      }),
    ).toBe('… by filter · 0 by name · counting…');
    expect(
      countSummary({
        byFilter: 3,
        byName: 0,
        count: { state: 'unknown' },
        providerKind: kind,
      }),
    ).toBe('3 by filter · 0 by name · total not known');
  });

  it("names GitLab's projects", () => {
    expect(
      countSummary({
        byName: 1,
        count: { state: 'known', total: 1, excluded: 0 },
        providerKind: 'gitlab',
      }),
    ).toBe('1 by name = 1 project');
  });
});

describe('exclusionEffect', () => {
  const source = (
    repositories: string[],
    exclude: string[],
    languages = [],
  ) => ({
    ...emptySource('github'),
    owner: 'o',
    repositories,
    exclude,
    languages,
  });

  it('says nothing without exclusions, or before the count', () => {
    expect(exclusionEffect(source(['a'], []), 0, 'github')).toBeUndefined();
    expect(exclusionEffect(source(['a'], ['a']), undefined, 'github')).toBe(
      undefined,
    );
  });

  it('says when none of the exclusions leaves anything out', () => {
    expect(
      exclusionEffect(
        source(['a', 'b'], ['c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']),
        0,
        'github',
      ),
    ).toBe(
      'Nothing is left out: the 8 exclusions match nothing the source selects.',
    );
  });

  it('names the idle exclusions where the form knows them', () => {
    expect(exclusionEffect(source(['a', 'b'], ['a', 'c']), 1, 'github')).toBe(
      '1 repository left out; 1 exclusion matches nothing the source selects: c.',
    );
    expect(exclusionEffect(source(['a'], ['a']), 1, 'github')).toBe(
      '1 repository left out.',
    );
  });

  it("counts a filtered source's idle exclusions without naming them", () => {
    expect(
      exclusionEffect(
        source([], ['a', 'b', 'c'], ['Go'] as never),
        1,
        'github',
      ),
    ).toBe(
      '1 repository left out; 2 exclusions match nothing the source selects.',
    );
  });
});
