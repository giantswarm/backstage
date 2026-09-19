import { useMemo } from 'react';
import { useApi } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { LIST_LIMIT, ListFilters, repositoriesApiRef } from '../apis';
import { callerTeams, TeamOption, teamOptions } from '../lib/scope';

/** The whole inventory, for the teams a declaration can be filed for. */
const INVENTORY: ListFilters = { scope: 'all', limit: LIST_LIMIT };

/**
 * The caller's repositories: the manager reads the person's teams on GitHub
 * for this scope, so their teams are the rows' teams -- the same listing the
 * Repositories page opens on, so it is answered from the cache there.
 */
const MINE: ListFilters = { scope: 'mine', limit: LIST_LIMIT };

export interface TeamOptions {
  /** The caller's team slugs, sorted; a form opens on the first. */
  own: string[];
  /**
   * The teams a form offers: the caller's own first, labelled so, then
   * every team the inventory knows a declaration of.
   */
  teams: TeamOption[];
  /** The teams are still being read: the choice is not complete yet. */
  loading: boolean;
  /** The manager did not answer one of the reads. */
  error: Error | undefined;
}

/**
 * The teams a form can name -- the owning team of Create repository, the
 * receiving team of Transfer -- read the way the Repositories page reads
 * them: who the caller is (`get_info`), the caller's repositories (the
 * `mine` listing, whose teams are the caller's) and the whole inventory
 * (every team with a declared repository). The page holds the same queries,
 * so a dialog opened on it is answered from the cache. `current` keeps a
 * team the form holds already when neither source names it.
 */
export function useTeamOptions(current = ''): TeamOptions {
  const api = useApi(repositoriesApiRef);
  const info = useQuery({
    queryKey: ['repositories', 'info'],
    queryFn: () => api.getInfo(),
  });
  const inventory = useQuery({
    queryKey: ['repositories', 'list', INVENTORY],
    queryFn: () => api.listRepositories(INVENTORY),
    enabled: !info.isLoading,
  });
  const mine = useQuery({
    queryKey: ['repositories', 'list', MINE],
    queryFn: () => api.listRepositories(MINE),
    enabled: !info.isLoading,
  });
  const own = useMemo(
    () => callerTeams(info.data, mine.data?.repositories ?? []),
    [info.data, mine.data],
  );
  const teams = useMemo(
    () =>
      teamOptions(
        own,
        (inventory.data?.repositories ?? []).map(row => row.team ?? ''),
        current,
      ),
    [own, inventory.data, current],
  );
  return {
    own,
    teams,
    loading: info.isLoading || mine.isLoading || inventory.isLoading,
    error: (info.error ?? mine.error ?? inventory.error ?? undefined) as
      Error | undefined,
  };
}
