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

/** One team a declaration form can be filed for. */
export interface TeamOption {
  id: string;
  label: string;
  /** The caller belongs to it, as the manager reports the caller's groups. */
  mine: boolean;
}

/**
 * The teams a declaration can be filed for: the caller's own first (labelled
 * so, the form opens on the first), then every team the inventory knows a
 * declaration of, then the one the form holds already when neither names it
 * (a team file the inventory has not swept yet). Sorted within each group;
 * no team twice.
 */
export function teamOptions(
  info: ManagerInfo | undefined,
  inventoryTeams: string[],
  current = '',
): TeamOption[] {
  const mine = teamsOf(info);
  const others = [
    ...new Set(
      inventoryTeams.filter(
        (team): team is string => !!team && !mine.includes(team),
      ),
    ),
  ].sort();
  const options: TeamOption[] = [
    ...mine.map(id => ({ id, label: `${id} (your team)`, mine: true })),
    ...others.map(id => ({ id, label: id, mine: false })),
  ];
  if (current && !options.some(option => option.id === current)) {
    options.push({ id: current, label: current, mine: false });
  }
  return options;
}
