import {
  Alignment,
  InventoryRecord,
  ListFilters,
  ManagerInfo,
  RepositoriesApi,
  RepositoryListing,
  Watch,
  WATCH_PHASES,
} from '../apis';
import { unusedWrites } from './fakeApi';
import {
  alignmentOf,
  daysSince,
  firstRelease,
  listingOf,
  newService,
  NOW,
  optInAlignmentOf,
  presentService,
  records as fixtureRecords,
  renovateStateOf,
  rowOf,
  schema as fixtureSchema,
  watchOf,
} from './records';
import { createInMemory, validateInMemory } from './validate';

export interface InMemoryApiOptions {
  /** The caller's team slugs: the `mine` scope, and `get_info`'s groups. */
  teams?: string[];
  records?: Record<string, InventoryRecord>;
  /** The moment activity is judged against; the fixtures' `NOW` by default. */
  now?: Date;
  /** `get_info`'s `schema`, the vocabulary the form offers; the fixtures' `schema` by default. */
  schema?: ManagerInfo['schema'];
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
 * Archived, or declared deleted: the repositories whose life is over, which
 * the manager's boolean `archived` filter selects and the listing hides by
 * default.
 */
export function isOver(record: InventoryRecord): boolean {
  return isArchived(record) || record.declaration?.lifecycle === 'deleted';
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

/** The pinned orb version is the one wanted, or starts with it at a version boundary: `10` matches `10.5.0`, not `100.0.0`. */
const orbMatches = (have: string, want: string) =>
  have === want || have.startsWith(`${want}.`);

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
    const state = renovateStateOf(record, now);
    const wanted =
      filters.renovate === 'configured'
        ? state !== 'missing'
        : state === filters.renovate;
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
  if (filters.archived !== undefined && isOver(record) !== filters.archived) {
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
  const ci = record.ci;
  if (filters.orb && !(ci?.orb && orbMatches(ci.orb, filters.orb))) {
    return false;
  }
  if (filters.arm64 !== undefined && ci?.arm64 !== filters.arm64) {
    return false;
  }
  if (filters.chinaPush && ci?.chinaPush !== filters.chinaPush) {
    return false;
  }
  if (filters.signing && ci?.signing !== filters.signing) {
    return false;
  }
  return true;
}

/**
 * giantswarm-repo-manager's read tools over the fixture records, filtering
 * the way `list_repositories` does and answering `get_repository` and
 * `refresh_repository` from the same records; `validate_repository` judges
 * a declaration the way the engine's creation rules do (a name is taken when
 * a record holds it) and `create_repository` adds the new repository's
 * record, converging. The dev app runs the page over it; the tests assert
 * the filters the page sends through `lists`.
 */
export function createInMemoryApi(
  options: InMemoryApiOptions = {},
): InMemoryRepositoriesApi {
  const teams = options.teams ?? ['team-bumblebee'];
  const now = options.now ?? NOW;
  const records = new Map(Object.entries(options.records ?? fixtureRecords));
  const lists: ListFilters[] = [];
  const refreshes: string[] = [];
  // How many phases each followed repository has reached: one more per call.
  const watched = new Map<string, number>();

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
    },
    inventory: { connected: true, records: records.size },
    circleci: { source: 'statuses+artifact' },
    schema: 'schema' in options ? options.schema : fixtureSchema,
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

  const world = {
    schema: info.schema ?? {},
    taken: (name: string) => records.has(`giantswarm/${name}`),
    callerTeams: teams,
    login: 'alice',
  };

  return {
    lists,
    refreshes,
    ...unusedWrites,
    getConnection: async () => ({ connected: true }),
    getInfo: async () => info,
    validateRepository: async input => validateInMemory(input, world),
    createRepository: async input => {
      const created = createInMemory(
        validateInMemory(input, world),
        world.login,
      );
      // The new repository's record, as the reconciler finds it: created and
      // scaffolded, the rest of the set-up still to come.
      created.repositories.forEach(repository => {
        records.set(`giantswarm/${repository.name}`, {
          ...newService,
          repository: `giantswarm/${repository.name}`,
          name: repository.name,
          declaration: {
            ...newService.declaration!,
            team: input.team,
            file: `repositories/${input.team}.yaml`,
            entry: `- name: ${repository.name}\n`,
          },
        });
      });
      return created;
    },
    listRepositories: async (filters): Promise<RepositoryListing> => {
      lists.push(filters);
      const matched = [...records.values()]
        .filter(candidate => matches(candidate, filters, teams, now))
        .map(candidate => rowOf(candidate, now))
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
    /**
     * `align_repository` the way the manager answers it: an undeclared
     * repository is checked from the team given (`mode: check`); a declared
     * one is aligned when its entry says `align: true` (`mode: align`) and
     * opted in through the pull request otherwise (`mode: opt-in`, the
     * fixture's present-service texts). A commit that dispatches marks the
     * record's pending run, so the dialog's follow has something to show.
     */
    alignRepository: async (name, args, write): Promise<Alignment> => {
      const current = record(name);
      const commit = 'mode' in write;
      const inputs = { repository: current.name, team: args.team };
      let alignment: Alignment;
      if (current.declaration === null) {
        alignment = alignmentOf(commit, {
          inputs,
          team: args.team,
          optedIn: false,
          mode: 'check',
          planned: undefined,
          checkedAt: undefined,
        });
      } else if (/^\s+align:\s*true\s*$/m.test(current.declaration.entry)) {
        alignment = alignmentOf(commit, {
          inputs,
          team: current.declaration.team,
        });
      } else {
        alignment = {
          ...optInAlignmentOf(commit),
          inputs,
          team: current.declaration.team,
        };
      }
      if (alignment.dispatched) {
        records.set(current.repository, {
          ...current,
          setup: {
            ...current.setup,
            pendingRun: {
              dispatchedAt: new Date().toISOString(),
              by: world.login,
              kind: 'dispatched',
            },
          },
        });
      }
      return alignment;
    },
    /**
     * The follow, a phase further on every call -- the creation left the
     * repository created and scaffolded -- ready with its first release at
     * the end; once the reconciler has reported (setUp), the record's set-up
     * converges the way the row then shows it.
     */
    watchRepository: async (name): Promise<Watch> => {
      const reached = Math.min(
        (watched.get(name) ?? 1) + 1,
        WATCH_PHASES.length - 1,
      );
      watched.set(name, reached);
      const through = WATCH_PHASES[reached];
      const url = `https://github.com/giantswarm/${name}`;
      if (reached >= WATCH_PHASES.indexOf('setUp')) {
        const current = records.get(`giantswarm/${name}`);
        if (current) {
          records.set(current.repository, {
            ...current,
            setup: {
              ...current.setup,
              checks: {
                ...presentService.setup.checks!,
                repository: current.repository,
                declared: name,
                team: current.declaration?.team ?? 'team-bumblebee',
              },
              lastRun: {
                ...presentService.setup.lastRun!,
                timestamp: now.toISOString(),
                change: { kind: 'created', by: world.login },
              },
            },
            findings: [],
          });
        }
      }
      const ready = through === 'released';
      return {
        ...watchOf(through, {
          changed: reached > 1,
          ready,
          release: ready
            ? { tag: firstRelease.tag, url: `${url}/releases/tag/v0.1.0` }
            : undefined,
        }),
        repository: url,
        waited: 0,
      };
    },
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
