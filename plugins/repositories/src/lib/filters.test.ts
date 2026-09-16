import { filtersFromParams, hasFilters, withFilter } from './filters';

describe('filters in the URL', () => {
  it('reads the tool arguments off the query string, typed', () => {
    const filters = filtersFromParams(
      new URLSearchParams(
        'scope=unassigned&search=must&fork=true&inactiveDays=90&minOrphanScore=x&renovate=missing&team=none',
      ),
    );
    expect(filters).toMatchObject({
      scope: 'unassigned',
      search: 'must',
      fork: true,
      inactiveDays: 90,
      renovate: 'missing',
      team: 'none',
    });
    expect(filters.minOrphanScore).toBeUndefined();
    expect(hasFilters(filters)).toBe(true);
  });

  it('ignores an unknown scope and reports no filters for a bare scope', () => {
    const filters = filtersFromParams(new URLSearchParams('scope=theirs'));
    expect(filters.scope).toBeUndefined();
    expect(hasFilters({ scope: 'mine', limit: 2000 })).toBe(false);
  });

  it('writes and clears one filter without touching the others', () => {
    const params = withFilter(new URLSearchParams('scope=all'), 'fork', false);
    expect(params.toString()).toBe('scope=all&fork=false');
    expect(withFilter(params, 'fork', undefined).toString()).toBe('scope=all');
  });
});
