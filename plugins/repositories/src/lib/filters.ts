import { ListFilters, Scope } from '../apis';

const SCOPES: Scope[] = ['mine', 'team', 'unassigned', 'all'];

/**
 * The page's filters live in the URL (`?scope=mine&renovate=missing…`), so a
 * view is shareable and survives a reload; the names are `list_repositories`'
 * arguments.
 */
export function filtersFromParams(params: URLSearchParams): ListFilters {
  const text = (name: string) => params.get(name) || undefined;
  const num = (name: string) => {
    const raw = params.get(name);
    const value = raw === null || raw === '' ? NaN : Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  };
  const scope = params.get('scope') as Scope | null;
  const flag = (name: string) => {
    const raw = params.get(name);
    if (raw === 'true' || raw === 'false') {
      return raw === 'true';
    }
    return undefined;
  };
  return {
    scope: scope && SCOPES.includes(scope) ? scope : undefined,
    search: text('search'),
    renovate: text('renovate') as ListFilters['renovate'],
    team: text('team'),
    visibility: text('visibility') as ListFilters['visibility'],
    fork: flag('fork'),
    lifecycle: text('lifecycle'),
    inactiveDays: num('inactiveDays'),
    minOrphanScore: num('minOrphanScore'),
    decision: text('decision'),
    finding: text('finding'),
  };
}

/** Writes one filter into the params; an empty value removes it. */
export function withFilter(
  params: URLSearchParams,
  name: keyof ListFilters,
  value: string | number | boolean | undefined,
): URLSearchParams {
  const next = new URLSearchParams(params);
  if (value === undefined || value === '') {
    next.delete(name);
  } else {
    next.set(name, String(value));
  }
  return next;
}

/** The arguments that are not filters: the scope and the page's own knobs. */
const NOT_A_FILTER: (keyof ListFilters)[] = [
  'scope',
  'limit',
  'stalePeriodDays',
];

/** Whether any filter is set (the scope and the row limit are none). */
export function hasFilters(filters: ListFilters): boolean {
  return Object.entries(filters).some(
    ([name, value]) =>
      !NOT_A_FILTER.includes(name as keyof ListFilters) && value !== undefined,
  );
}
