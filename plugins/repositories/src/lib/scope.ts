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
