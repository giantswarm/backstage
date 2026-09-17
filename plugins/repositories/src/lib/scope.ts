import { ManagerInfo, Scope } from '../apis';

/**
 * The scope the page opens on: *My team* for everyone, *Unassigned* for a
 * Planeteer -- the team that owns the repositories nobody declared. Read off
 * the caller's groups as the manager reports them (`get_info`).
 */
export function defaultScope(info: ManagerInfo | undefined): Scope {
  const groups = info?.caller?.groups ?? [];
  return groups.some(group => /team-planeteers$/.test(group))
    ? 'unassigned'
    : 'mine';
}

/**
 * The caller's team slugs (`team-bumblebee`) as the manager's groups name
 * them (`giantswarm-github:giantswarm:team-bumblebee`), for the team a
 * declaration form opens on. The manager decides membership; this is a
 * default, editable.
 */
export function teamsOf(info: ManagerInfo | undefined): string[] {
  const groups = info?.caller?.groups ?? [];
  return [
    ...new Set(
      groups
        .map(group => /(team-[\w-]+)$/.exec(group)?.[1])
        .filter((team): team is string => !!team),
    ),
  ].sort();
}
