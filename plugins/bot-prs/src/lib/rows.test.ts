import { rowsOf, type MargeResult } from './marge';
import {
  ageDays,
  applyFilters,
  classificationOptions,
  countTiles,
  filtersFromParams,
  formatAge,
  hasFilters,
  sortRows,
  withFilter,
} from './rows';

const summary = {
  total: 3,
  merged: 0,
  auto_merge: 0,
  remedied: 0,
  failed: 1,
  security_failures: 0,
  ci_unavailable: 0,
  ci_no_verdict: 0,
  stale: 1,
  refreshed: 0,
  cancelled: 0,
  retried: 0,
  obsolete: 0,
  waiting: 0,
  skipped: 0,
  eligible: 0,
  unclassified: 1,
};

const now = Date.parse('2026-09-17T12:00:00Z');

const result: MargeResult = {
  summary,
  action_required: [
    {
      owner: 'giantswarm',
      repo: 'klaus-operator',
      number: 37,
      title: 'Remediate Nancy findings on main',
      url: 'https://github.com/giantswarm/klaus-operator/pull/37',
      status: 'Failed',
      detail: 'checks failed: semantic-pull-request',
      kind: 'herald',
      created_at: '2026-03-03T10:00:00Z',
    },
  ],
  stale: [
    {
      owner: 'giantswarm',
      repo: 'agent-platform',
      number: 488,
      title: 'chore(deps): update agent-manager docker tag to v1.1.11',
      url: 'https://github.com/giantswarm/agent-platform/pull/488',
      status: 'Stale',
      kind: 'renovate',
      created_at: '2026-09-16T10:00:00Z',
    },
  ],
  unclassified: [
    {
      owner: 'giantswarm',
      repo: 'backstage',
      number: 2250,
      title: 'chore(deps): update dependency typescript to v7',
      url: 'https://github.com/giantswarm/backstage/pull/2250',
      status: 'Unclassified',
      kind: 'renovate',
      created_at: '2026-09-17T09:00:00Z',
    },
  ],
};

const rows = rowsOf(result, 'bumblebee');

describe('filtersFromParams and withFilter', () => {
  it('reads the URL and rejects an unknown scope or classification', () => {
    const params = new URLSearchParams(
      'scope=all&team=bumblebee&kind=renovate&classification=stale&repository=giantswarm/backstage&dependency=typescript&search=v7',
    );
    expect(filtersFromParams(params)).toEqual({
      scope: 'all',
      team: 'bumblebee',
      kind: 'renovate',
      classification: 'stale',
      repository: 'giantswarm/backstage',
      dependency: 'typescript',
      search: 'v7',
    });
    expect(
      filtersFromParams(new URLSearchParams('scope=nope&classification=x')),
    ).toEqual({
      scope: undefined,
      team: undefined,
      kind: undefined,
      classification: undefined,
      repository: undefined,
      dependency: undefined,
      search: undefined,
    });
  });

  it('writes and removes one filter', () => {
    const params = withFilter(
      new URLSearchParams('scope=all'),
      'kind',
      'herald',
    );
    expect(params.toString()).toBe('scope=all&kind=herald');
    expect(withFilter(params, 'kind', undefined).toString()).toBe('scope=all');
  });

  it('counts the scope and the team as no filter', () => {
    expect(hasFilters({ scope: 'all', team: 'bumblebee' })).toBe(false);
    expect(hasFilters({ scope: 'all', kind: 'herald' })).toBe(true);
  });
});

describe('applyFilters', () => {
  it('narrows by team, repository, kind, classification, dependency and text', () => {
    expect(applyFilters(rows, { kind: 'herald' }).map(row => row.ref)).toEqual([
      'giantswarm/klaus-operator#37',
    ]);
    expect(
      applyFilters(rows, { classification: 'unclassified' }).map(
        row => row.ref,
      ),
    ).toEqual(['giantswarm/backstage#2250']);
    expect(
      applyFilters(rows, { dependency: 'typescript' }).map(row => row.ref),
    ).toEqual(['giantswarm/backstage#2250']);
    expect(applyFilters(rows, { search: 'nancy' }).map(row => row.ref)).toEqual(
      ['giantswarm/klaus-operator#37'],
    );
    expect(applyFilters(rows, { team: 'atlas' })).toEqual([]);
    expect(
      applyFilters(rows, { repository: 'giantswarm/agent-platform' }),
    ).toHaveLength(1);
  });
});

describe('sortRows', () => {
  it('sorts worst first by classification, and by age', () => {
    expect(
      sortRows(rows, 'classification', 'asc').map(row => row.group),
    ).toEqual(['action_required', 'stale', 'unclassified']);
    expect(sortRows(rows, 'age', 'desc', now).map(row => row.number)).toEqual([
      37, 488, 2250,
    ]);
  });
});

describe('ageDays', () => {
  it('reads the age off created_at, so a PR opened today is today and not unknown', () => {
    // rowsOf lists the groups in the engine's order: action_required,
    // unclassified, stale.
    expect(ageDays(rows[1], now)).toBe(0);
    expect(formatAge(ageDays(rows[1], now))).toBe('today');
    expect(ageDays(rows[2], now)).toBe(1);
    expect(formatAge(ageDays(rows[2], now))).toBe('1 d');
    expect(formatAge(ageDays({ age_days: undefined }))).toBe('—');
    expect(ageDays({ age_days: 5 })).toBe(5);
  });
});

describe('countTiles and classificationOptions', () => {
  it('counts per engine state, bot and age band', () => {
    const tiles = countTiles(rows, now);
    expect(tiles.classification).toEqual({
      Failed: 1,
      Stale: 1,
      Unclassified: 1,
    });
    expect(tiles.kind).toEqual({ herald: 1, renovate: 2 });
    expect(classificationOptions(rows)).toEqual([
      { value: 'action_required', label: 'Failed' },
      { value: 'unclassified', label: 'Unclassified' },
      { value: 'stale', label: 'Stale' },
    ]);
  });
});
