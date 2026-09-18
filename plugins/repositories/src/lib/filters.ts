import { LIFECYCLES, ListFilters, Scope } from '../apis';

const SCOPES: Scope[] = ['mine', 'team', 'unassigned', 'all'];

/**
 * The page's filters live in the URL (`?scope=mine&renovate=missing…`), so a
 * view is shareable and survives a reload; the names are `list_repositories`'
 * arguments, with one page knob of its own: `archived=true` in the URL is the
 * person's *Show archived* choice, which makes the request drop `archived`
 * (every repository) instead of the default `archived=false` (the archived
 * ones hidden). `lifecycle=archived` asks for them explicitly and drops it
 * too.
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
  const lifecycle = text('lifecycle');
  return {
    scope: scope && SCOPES.includes(scope) ? scope : undefined,
    search: text('search'),
    renovate: text('renovate') as ListFilters['renovate'],
    team: text('team'),
    visibility: text('visibility') as ListFilters['visibility'],
    fork: flag('fork'),
    lifecycle,
    archived: showsArchived(params) ? undefined : false,
    inactiveDays: num('inactiveDays'),
    finding: text('finding'),
    orb: text('orb'),
    arm64: flag('arm64'),
    chinaPush: text('chinaPush') as ListFilters['chinaPush'],
    signing: text('signing') as ListFilters['signing'],
  };
}

/** Whether the URL asks for the archived repositories: the switch, or the lifecycle. */
export function showsArchived(params: URLSearchParams): boolean {
  return (
    params.get('archived') === 'true' ||
    params.get('lifecycle') === LIFECYCLES[2]
  );
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

/**
 * The arguments that are not filters: the scope, the row limit and the
 * archived default -- hiding the archived repositories is the page's view,
 * not a narrowing the person asked for.
 */
const NOT_A_FILTER: (keyof ListFilters)[] = ['scope', 'limit', 'archived'];

/** Whether any filter is set. */
export function hasFilters(filters: ListFilters): boolean {
  return Object.entries(filters).some(
    ([name, value]) =>
      !NOT_A_FILTER.includes(name as keyof ListFilters) && value !== undefined,
  );
}
