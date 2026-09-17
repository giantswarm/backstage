import {
  filtersFromParams,
  hasFilters,
  showsArchived,
  withFilter,
} from './filters';

describe('filters in the URL', () => {
  it('reads the tool arguments off the query string, typed', () => {
    const filters = filtersFromParams(
      new URLSearchParams(
        'scope=unassigned&search=must&fork=true&inactiveDays=90&renovate=missing&team=none&finding=default-icon&visibility=public&lifecycle=deprecated',
      ),
    );
    expect(filters).toEqual({
      scope: 'unassigned',
      search: 'must',
      fork: true,
      inactiveDays: 90,
      renovate: 'missing',
      team: 'none',
      finding: 'default-icon',
      visibility: 'public',
      lifecycle: 'deprecated',
      archived: false,
    });
    expect(hasFilters(filters)).toBe(true);
  });

  it('knows nothing of the arguments the manager dropped', () => {
    const filters = filtersFromParams(
      new URLSearchParams('minOrphanScore=40&decision=keep&stalePeriodDays=9'),
    );
    expect(filters).not.toHaveProperty('minOrphanScore');
    expect(filters).not.toHaveProperty('decision');
    expect(filters).not.toHaveProperty('stalePeriodDays');
  });

  it('hides the archived repositories unless the URL asks for them', () => {
    expect(filtersFromParams(new URLSearchParams('scope=all')).archived).toBe(
      false,
    );
    expect(showsArchived(new URLSearchParams('scope=all'))).toBe(false);

    // Show archived: every repository, the archived ones included.
    const shown = new URLSearchParams('scope=all&archived=true');
    expect(filtersFromParams(shown).archived).toBeUndefined();
    expect(showsArchived(shown)).toBe(true);

    // Asking for the archived lifecycle asks for them too.
    const archived = new URLSearchParams('lifecycle=archived');
    expect(filtersFromParams(archived)).toMatchObject({
      lifecycle: 'archived',
      archived: undefined,
    });
    expect(showsArchived(archived)).toBe(true);

    // Anything else in `archived` is not a choice.
    expect(
      filtersFromParams(new URLSearchParams('archived=maybe')).archived,
    ).toBe(false);
  });

  it('ignores an unknown scope and reports no filters for a bare view', () => {
    const filters = filtersFromParams(new URLSearchParams('scope=theirs'));
    expect(filters.scope).toBeUndefined();
    expect(hasFilters({ scope: 'mine', limit: 2000, archived: false })).toBe(
      false,
    );
  });

  it('writes and clears one filter without touching the others', () => {
    const params = withFilter(new URLSearchParams('scope=all'), 'fork', false);
    expect(params.toString()).toBe('scope=all&fork=false');
    expect(withFilter(params, 'fork', undefined).toString()).toBe('scope=all');
    expect(withFilter(params, 'archived', true).toString()).toBe(
      'scope=all&fork=false&archived=true',
    );
  });
});
