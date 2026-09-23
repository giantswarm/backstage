import {
  GREEN_GROUP,
  MARGE_GROUPS,
  type BotPrRow,
  type MargeGroup,
} from './marge';

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

/** Where a row's class sits in that order: the key the table sorts on. */
export function groupRank(row: BotPrRow): number {
  return GROUP_ORDER[row.group];
}

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

export type QueueStats = {
  /** Every row in view. */
  total: number;
  /** Green and merged by the team policy: what **Approve and merge** acts on. */
  green: number;
  /** A check has not reported yet. */
  waiting: number;
  /** A person decides: the engine will not act on its own. */
  actionRequired: number;
  /** A security check failed. The engine never merges past one. */
  securityFailures: number;
  /** No sweep has labelled the PR yet. */
  unclassified: number;
};

/** Counts over the listed rows, for the stats strip. */
export function countStats(rows: BotPrRow[]): QueueStats {
  const of = (group: MargeGroup) =>
    rows.filter(row => row.group === group).length;
  return {
    total: rows.length,
    green: greenRows(rows).length,
    waiting: of('waiting'),
    actionRequired: of('action_required'),
    securityFailures: of('security_failures'),
    unclassified: of('unclassified'),
  };
}

/**
 * The rows a sweep would approve and merge: the ones the engine filed as
 * green under the team policy. The button acts on these and on nothing else;
 * the engine classifies each one again before it writes.
 */
export function greenRows(rows: BotPrRow[]): BotPrRow[] {
  return rows.filter(row => row.group === GREEN_GROUP);
}

/** The refs of each team, keyed by team: marge sweeps one team a call. */
export function refsByTeam(rows: BotPrRow[]): Record<string, string[]> {
  const byTeam: Record<string, string[]> = {};
  for (const row of rows) {
    byTeam[row.team] = [...(byTeam[row.team] ?? []), row.ref];
  }
  return byTeam;
}

/** The green rows of each team: what **Approve and merge** sweeps. */
export function greenByTeam(rows: BotPrRow[]): Record<string, string[]> {
  return refsByTeam(greenRows(rows));
}

/** The repository without its org: nearly every row of the queue shares it. */
export const nameOf = (row: Pick<BotPrRow, 'repository'>) =>
  row.repository.replace(/^[^/]+\//, '');

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
