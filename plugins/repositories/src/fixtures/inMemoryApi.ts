import {
  InventoryRecord,
  ListFilters,
  ManagerInfo,
  RepositoriesApi,
  RepositoryListing,
} from '../apis';
import { unusedWrites } from './fakeApi';
import { listingOf, records as fixtureRecords, rowOf } from './records';

/** The manager's default period for judging Renovate active or inactive. */
export const RENOVATE_ACTIVE_DAYS = 180;

const DAY_MS = 86_400_000;

export interface InMemoryApiOptions {
  /** The caller's team slugs: the `mine` scope, and `get_info`'s groups. */
  teams?: string[];
  records?: Record<string, InventoryRecord>;
  /** The moment activity is judged against. */
  now?: Date;
}

export interface InMemoryRepositoriesApi extends RepositoriesApi {
  /** Every `listRepositories` call's filters, in order. */
  readonly lists: ListFilters[];
  /** Every `refreshRepository` call's repository, in order. */
  readonly refreshes: string[];
}

/** Declared archived, or archived on GitHub. */
export function isArchived(record: InventoryRecord): boolean {
  return (
    record.declaration?.lifecycle === 'archived' ||
    record.reality?.isArchived === true
  );
}

/**
 * Whether a record has the lifecycle asked for, as the manager judges it:
 * `archived` is declared archived or archived on GitHub, `active` is no
 * lifecycle declared (or `active`) and not archived on GitHub, anything else
 * is matched against the declared lifecycle.
 */
export function hasLifecycle(record: InventoryRecord, lifecycle: string) {
  const declared = record.declaration?.lifecycle;
  switch (lifecycle) {
    case 'archived':
      return isArchived(record);
    case 'active':
      return (
        (!declared || declared === 'active') && !record.reality?.isArchived
      );
    default:
      return declared === lifecycle;
  }
}

const daysSince = (iso: string | undefined, now: Date) =>
  iso ? (now.getTime() - new Date(iso).getTime()) / DAY_MS : Infinity;

/** Renovate configured and heard from within the activity period. */
export function renovateActive(record: InventoryRecord, now: Date): boolean {
  if (!record.renovate.configured) {
    return false;
  }
  const lastSeen =
    record.renovate.lastPullRequest?.createdAt ?? record.renovate.lastCommit;
  return daysSince(lastSeen, now) <= RENOVATE_ACTIVE_DAYS;
}

/**
 * Whether a record passes `list_repositories`' filters, each as the manager
 * applies it: the scope first, then `team` wherever it can apply, then the
 * rest.
 */
export function matches(
  record: InventoryRecord,
  filters: ListFilters,
  callerTeams: string[],
  now: Date,
): boolean {
  const team = record.declaration?.team;
  const scope = filters.scope ?? 'mine';
  const inScope = {
    mine: team !== undefined && callerTeams.includes(team),
    team: filters.team !== undefined && team === filters.team,
    unassigned: record.declaration === null,
    all: true,
  }[scope];
  if (!inScope) {
    return false;
  }
  if (filters.team !== undefined && scope !== 'unassigned') {
    if (filters.team === 'none' ? team !== undefined : team !== filters.team) {
      return false;
    }
  }
  if (filters.search) {
    const needle = filters.search.toLowerCase();
    const haystack =
      `${record.repository} ${record.reality?.description ?? ''}`.toLowerCase();
    if (!haystack.includes(needle)) {
      return false;
    }
  }
  if (filters.renovate) {
    const configured = record.renovate.configured;
    const active = renovateActive(record, now);
    const wanted = {
      configured,
      missing: !configured,
      active,
      inactive: configured && !active,
    }[filters.renovate];
    if (!wanted) {
      return false;
    }
  }
  if (filters.visibility && record.reality?.visibility !== filters.visibility) {
    return false;
  }
  if (
    filters.fork !== undefined &&
    (record.reality?.isFork ?? false) !== filters.fork
  ) {
    return false;
  }
  if (filters.lifecycle && !hasLifecycle(record, filters.lifecycle)) {
    return false;
  }
  if (
    filters.archived !== undefined &&
    isArchived(record) !== filters.archived
  ) {
    return false;
  }
  if (
    filters.inactiveDays !== undefined &&
    daysSince(record.reality?.lastPersonCommit?.date, now) <=
      filters.inactiveDays
  ) {
    return false;
  }
  if (
    filters.finding &&
    !record.findings.some(finding => finding.kind === filters.finding)
  ) {
    return false;
  }
  return true;
}

/**
 * giantswarm-repo-manager's read tools over the fixture records, filtering
 * the way `list_repositories` does and answering `get_repository` and
 * `refresh_repository` from the same records. The dev app runs the page over
 * it; the tests assert the filters the page sends through `lists`.
 */
export function createInMemoryApi(
  options: InMemoryApiOptions = {},
): InMemoryRepositoriesApi {
  const teams = options.teams ?? ['team-bumblebee'];
  const now = options.now ?? new Date();
  const records = new Map(Object.entries(options.records ?? fixtureRecords));
  const lists: ListFilters[] = [];
  const refreshes: string[] = [];

  const info: ManagerInfo = {
    version: 'dev',
    toolPrefix: 'giantswarm-repo-manager',
    caller: {
      email: 'alice@example.com',
      name: 'Alice',
      groups: teams.map(team => `giantswarm-github:giantswarm:${team}`),
      source: 'dev',
    },
    github: {
      apiUrl: 'https://api.github.com',
      grant: { obtained: true, login: 'alice' },
      circleciConfigured: true,
    },
    inventory: { connected: true, records: records.size },
  };

  const record = (name: string): InventoryRecord => {
    const found =
      records.get(name) ?? records.get(`giantswarm/${name}`) ?? undefined;
    if (!found) {
      const error = new Error(`${name}: no record`);
      error.name = 'NotFoundError';
      throw error;
    }
    return found;
  };

  return {
    lists,
    refreshes,
    ...unusedWrites,
    getConnection: async () => ({ connected: true }),
    getInfo: async () => info,
    listRepositories: async (filters): Promise<RepositoryListing> => {
      lists.push(filters);
      const matched = [...records.values()]
        .filter(candidate => matches(candidate, filters, teams, now))
        .map(rowOf)
        .sort((a, b) =>
          a.repository.localeCompare(b.repository, 'en', {
            sensitivity: 'base',
          }),
        );
      const shown = matched.slice(0, filters.limit ?? 100);
      const foreignTeam =
        (filters.scope ?? 'mine') === 'mine' &&
        filters.team !== undefined &&
        !teams.includes(filters.team);
      return {
        ...listingOf(shown, records.size),
        matched: matched.length,
        ...(foreignTeam && {
          note: `${filters.team} is not one of your teams; no repository of yours is in it`,
        }),
      };
    },
    getRepository: async name => record(name),
    refreshRepository: async name => {
      refreshes.push(name);
      const refreshed: InventoryRecord = {
        ...record(name),
        refreshedAt: now.toISOString(),
        source: 'refresh',
        age: '0s',
      };
      records.set(refreshed.repository, refreshed);
      return refreshed;
    },
  };
}
