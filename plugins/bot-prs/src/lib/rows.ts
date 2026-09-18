import { MARGE_GROUPS, type BotPrRow, type MargeGroup } from './marge';

/**
 * The page's filters live in the URL (`?team=bumblebee&kind=renovate…`), so a
 * view is shareable and survives a reload. Every filter but `team` is applied
 * on the page: marge answers the whole team in one call.
 */
export type Scope = 'mine' | 'all';

export type QueueFilters = {
  /** `mine`: the person's teams; `all`: every team the catalogue names. */
  scope?: Scope;
  /** Narrows `all` to one team; the team filter of the bar. */
  team?: string;
  search?: string;
  repository?: string;
  kind?: string;
  classification?: MargeGroup;
  dependency?: string;
};

const FILTER_NAMES: (keyof QueueFilters)[] = [
  'scope',
  'team',
  'search',
  'repository',
  'kind',
  'classification',
  'dependency',
];

export function filtersFromParams(params: URLSearchParams): QueueFilters {
  const text = (name: string) => params.get(name) || undefined;
  const classification = text('classification');
  const scope = text('scope');
  return {
    scope: scope === 'mine' || scope === 'all' ? scope : undefined,
    team: text('team'),
    search: text('search'),
    repository: text('repository'),
    kind: text('kind'),
    classification: (MARGE_GROUPS as readonly string[]).includes(
      classification ?? '',
    )
      ? (classification as MargeGroup)
      : undefined,
    dependency: text('dependency'),
  };
}

/** Writes one filter into the params; an empty value removes it. */
export function withFilter(
  params: URLSearchParams,
  name: keyof QueueFilters,
  value: string | undefined,
): URLSearchParams {
  const next = new URLSearchParams(params);
  if (value === undefined || value === '') {
    next.delete(name);
  } else {
    next.set(name, value);
  }
  return next;
}

/** Whether any filter narrows the queue. The scope and the team pick the queue, they do not narrow it. */
export function hasFilters(filters: QueueFilters): boolean {
  return FILTER_NAMES.some(
    name => name !== 'scope' && name !== 'team' && filters[name],
  );
}

export function applyFilters(
  rows: BotPrRow[],
  filters: QueueFilters,
): BotPrRow[] {
  const search = filters.search?.toLowerCase();
  return rows.filter(row => {
    if (filters.team && row.team !== filters.team) {
      return false;
    }
    if (filters.repository && row.repository !== filters.repository) {
      return false;
    }
    if (filters.kind && (row.kind ?? '') !== filters.kind) {
      return false;
    }
    if (filters.classification && row.group !== filters.classification) {
      return false;
    }
    if (filters.dependency && row.dependency !== filters.dependency) {
      return false;
    }
    if (
      search &&
      !`${row.title} ${row.ref} ${row.detail ?? ''}`
        .toLowerCase()
        .includes(search)
    ) {
      return false;
    }
    return true;
  });
}

export type SortColumn =
  | 'team'
  | 'repository'
  | 'title'
  | 'dependency'
  | 'kind'
  | 'update'
  | 'age'
  | 'classification'
  | 'rescue';

export type SortDirection = 'asc' | 'desc';

/** The engine's group order, so a sort by classification reads worst first. */
const GROUP_ORDER: Record<MargeGroup, number> = Object.fromEntries(
  [
    'security_failures',
    'action_required',
    'ci_no_verdict',
    'ci_unavailable',
    'stale',
    'cancelled',
    'obsolete',
    'waiting',
    'unclassified',
    'eligible',
    'skipped',
    'refreshed',
    'retried',
    'remedied',
    'auto_merge',
    'merged',
  ].map((group, index) => [group, index]),
) as Record<MargeGroup, number>;

/**
 * The PR's age in whole days, from `created_at`. The engine leaves `age_days`
 * out of the JSON when it is zero, so a PR opened today would read as unknown
 * if the field alone decided; the timestamp is always there.
 */
export function ageDays(
  row: Pick<BotPrRow, 'created_at' | 'age_days'>,
  now = Date.now(),
): number | undefined {
  if (row.created_at) {
    const created = Date.parse(row.created_at);
    if (!Number.isNaN(created)) {
      return Math.max(0, Math.floor((now - created) / 86_400_000));
    }
  }
  return row.age_days;
}

export function formatAge(days: number | undefined): string {
  if (days === undefined) {
    return '—';
  }
  return days === 0 ? 'today' : `${days} d`;
}

function key(row: BotPrRow, column: SortColumn, now: number): string | number {
  switch (column) {
    case 'team':
      return row.team;
    case 'repository':
      return row.repository.toLowerCase();
    case 'title':
      return row.title.toLowerCase();
    case 'dependency':
      return row.dependency.toLowerCase();
    case 'kind':
      return row.kind ?? '';
    case 'update':
      return row.update_type ?? '';
    case 'age':
      return ageDays(row, now) ?? -1;
    case 'classification':
      return GROUP_ORDER[row.group];
    case 'rescue':
      return row.rescue ? `${row.rescue.outcome} ${row.rescue.at ?? ''}` : '';
    default:
      return '';
  }
}

/**
 * The rows sorted by a column; ties keep the engine's order. The clock is a
 * parameter so the age order does not depend on the hour a test runs at.
 */
export function sortRows(
  rows: BotPrRow[],
  column: SortColumn,
  direction: SortDirection,
  now = Date.now(),
): BotPrRow[] {
  const sign = direction === 'asc' ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const ka = key(a.row, column, now);
      const kb = key(b.row, column, now);
      if (ka < kb) {
        return -sign;
      }
      if (ka > kb) {
        return sign;
      }
      return a.index - b.index;
    })
    .map(({ row }) => row);
}

export type AgeBand = 'this week' | 'this month' | 'older';

export function ageBand(days: number | undefined): AgeBand {
  if (days === undefined || days < 7) {
    return 'this week';
  }
  return days < 30 ? 'this month' : 'older';
}

export type Tiles = {
  /** Per classification the engine reports, in the engine's words. */
  classification: Record<string, number>;
  /** Per bot kind. */
  kind: Record<string, number>;
  age: Record<AgeBand, number>;
};

/** Counts over the listed rows, for the tiles. */
export function countTiles(rows: BotPrRow[], now = Date.now()): Tiles {
  const tiles: Tiles = {
    classification: {},
    kind: {},
    age: { 'this week': 0, 'this month': 0, older: 0 },
  };
  for (const row of rows) {
    tiles.classification[row.status] =
      (tiles.classification[row.status] ?? 0) + 1;
    const kind = row.kind ?? 'unknown';
    tiles.kind[kind] = (tiles.kind[kind] ?? 0) + 1;
    tiles.age[ageBand(ageDays(row, now))]++;
  }
  return tiles;
}

/** The distinct values of a column over the rows, sorted, for a filter's options. */
export function optionsOf(
  rows: BotPrRow[],
  pick: (row: BotPrRow) => string | undefined,
): string[] {
  return [
    ...new Set(rows.map(pick).filter((value): value is string => !!value)),
  ].sort();
}

/**
 * The classification groups present in the rows, in the engine's order, each
 * with the engine's state name for its entries as the label.
 */
export function classificationOptions(
  rows: BotPrRow[],
): { value: MargeGroup; label: string }[] {
  const label = new Map<MargeGroup, string>();
  for (const row of rows) {
    if (!label.has(row.group)) {
      label.set(row.group, row.status);
    }
  }
  return MARGE_GROUPS.filter(group => label.has(group)).map(group => ({
    value: group,
    label: label.get(group)!,
  }));
}
