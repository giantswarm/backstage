import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { SortDescriptor } from '@backstage/ui';

import {
  DEFAULT_FILTERS,
  HIVE_DEFAULT_TEAM,
  HIVE_TEAMS,
  teamSlugOf,
  type Filters,
} from '../lib/github';

/** Where Hive keeps the team the reader picked (plans' `useHiveTeam`). */
const HIVE_TEAM_STORAGE_KEY = 'plans.hive.team.chosen';

function pickedHiveTeam(): string | undefined {
  try {
    return window.localStorage.getItem(HIVE_TEAM_STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * The team Hive's header is scoped to, as plans' `useHiveTeam` decides it:
 * `?team=`, which the header writes, else the reader's pick, else their own
 * Hive team (`myTeams`, catalog slugs), else Hive's default.
 */
export function useHiveTeamScope(myTeams: readonly string[]): string {
  const [searchParams] = useSearchParams();
  return (
    searchParams.get('team') ??
    pickedHiveTeam() ??
    HIVE_TEAMS.find(team => myTeams.includes(teamSlugOf(team))) ??
    HIVE_DEFAULT_TEAM
  );
}

/** The filters as URL parameters; each is on unless the URL turns it off. */
export const FILTER_PARAMS: Record<keyof Filters, string> = {
  hideBots: 'bots',
  hideDrafts: 'drafts',
  orgOnly: 'anyOrg',
  hideArchived: 'archived',
};

const sortParam = (section: string) => `sort.${section}`;
const STATUS_PARAM = 'status';

/** Oldest first: the longest-waiting PRs on top. */
export const DEFAULT_SORT: SortDescriptor = {
  column: 'created',
  direction: 'ascending',
};

function sortOf(value: string | null): SortDescriptor {
  const [column, direction] = (value ?? '').split(':');
  if (!column || (direction !== 'ascending' && direction !== 'descending')) {
    return DEFAULT_SORT;
  }
  return { column, direction };
}

/**
 * The tab's state that a shared link carries: the filters (`?bots=show`,
 * `?drafts=show`, `?anyOrg=1`, `?archived=show` turn one off), each
 * section's sort (`?sort.waiting=updated:descending`) and the sections whose
 * status was asked for (`?status=team,reviewed`).
 */
export function useTabParams() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters: Filters = useMemo(
    () => ({
      hideBots: searchParams.get(FILTER_PARAMS.hideBots) === null,
      hideDrafts: searchParams.get(FILTER_PARAMS.hideDrafts) === null,
      orgOnly: searchParams.get(FILTER_PARAMS.orgOnly) === null,
      hideArchived: searchParams.get(FILTER_PARAMS.hideArchived) === null,
    }),
    [searchParams],
  );

  const update = useCallback(
    (change: (params: URLSearchParams) => void) =>
      setSearchParams(
        prev => {
          const params = new URLSearchParams(prev);
          change(params);
          return params;
        },
        { replace: true },
      ),
    [setSearchParams],
  );

  const setFilter = useCallback(
    (key: keyof Filters, on: boolean) =>
      update(params => {
        if (on === DEFAULT_FILTERS[key]) {
          params.delete(FILTER_PARAMS[key]);
        } else {
          params.set(FILTER_PARAMS[key], key === 'orgOnly' ? '1' : 'show');
        }
      }),
    [update],
  );

  const sortFor = useCallback(
    (section: string) => sortOf(searchParams.get(sortParam(section))),
    [searchParams],
  );

  const setSort = useCallback(
    (section: string, sort: SortDescriptor) =>
      update(params => {
        if (
          sort.column === DEFAULT_SORT.column &&
          sort.direction === DEFAULT_SORT.direction
        ) {
          params.delete(sortParam(section));
        } else {
          params.set(
            sortParam(section),
            `${String(sort.column)}:${sort.direction}`,
          );
        }
      }),
    [update],
  );

  const statusOn = useMemo(
    () =>
      new Set(
        (searchParams.get(STATUS_PARAM) ?? '').split(',').filter(Boolean),
      ),
    [searchParams],
  );

  const setStatusOn = useCallback(
    (section: string, on: boolean) =>
      update(params => {
        const next = new Set(
          (params.get(STATUS_PARAM) ?? '').split(',').filter(Boolean),
        );
        if (on) {
          next.add(section);
        } else {
          next.delete(section);
        }
        if (next.size === 0) {
          params.delete(STATUS_PARAM);
        } else {
          params.set(STATUS_PARAM, [...next].sort().join(','));
        }
      }),
    [update],
  );

  /** Hive's header search, which every Hive tab narrows its lists by. */
  const search = searchParams.get('q') ?? '';

  return {
    filters,
    setFilter,
    sortFor,
    setSort,
    statusOn,
    setStatusOn,
    search,
  };
}
