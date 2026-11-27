import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  identityApiRef,
  useApi,
  useApiHolder,
  type IdentityApi,
} from '@backstage/frontend-plugin-api';
import {
  catalogApiRef,
  type CatalogApi,
} from '@backstage/plugin-catalog-react';
import { QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlansApi, plansApiRef } from '../apis';
import {
  ALL_TEAMS,
  DEFAULT_TEAM,
  historyForTeam,
  nowForTeam,
  ownHiveTeamOf,
  teamSetFor,
  teamSlugOfGroupRef,
} from '../lib/hive';
import {
  History,
  HistoryWindow,
  HIVE_HISTORY_WINDOW,
  KnowledgeCategory,
  KnowledgeDoc,
  knowledgeDocs,
  MAGAZINE_TEAMS_FILE,
  magazineFile,
  Meta,
  Now,
  TeamSets,
} from '../lib/magazine';

async function magazineRefs(plansApi: PlansApi) {
  const magazine = await plansApi.getMagazine();
  if (!magazine.configured) {
    throw new Error(
      'This portal has no product magazine configured (plans.magazine.repository).',
    );
  }
  return magazine;
}

async function readMagazineJson<T>(
  plansApi: PlansApi,
  path: string,
): Promise<T> {
  const { repository, ref } = await magazineRefs(plansApi);
  const { content } = await plansApi.getContent(path, ref, repository);
  return JSON.parse(content) as T;
}

// --- Team scope -----------------------------------------------------------

/**
 * The team the reader picked in the header. A key of its own: the header
 * used to save the team it showed under `plans.hive.team` even when nobody
 * picked it, so that key holds Bumblebee for every reader. It is removed the
 * first time storage is read, and earlier picks start over once.
 */
const TEAM_STORAGE_KEY = 'plans.hive.team.chosen';
const LEGACY_TEAM_STORAGE_KEY = 'plans.hive.team';
const TEAM_SEARCH_PARAM = 'team';
const teamListeners = new Set<() => void>();

function readStoredTeam(): string | undefined {
  try {
    window.localStorage.removeItem(LEGACY_TEAM_STORAGE_KEY);
    return window.localStorage.getItem(TEAM_STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

// `null` until read: `undefined` is "nothing picked".
let storedTeam: string | undefined | null = null;

function getTeamSnapshot(): string | undefined {
  if (storedTeam === null) {
    storedTeam = readStoredTeam();
  }
  return storedTeam;
}

function subscribeTeam(listener: () => void) {
  teamListeners.add(listener);
  return () => teamListeners.delete(listener);
}

function storeTeam(team: string) {
  storedTeam = team;
  try {
    window.localStorage.setItem(TEAM_STORAGE_KEY, team);
  } catch {
    // Private mode: the choice lasts for this page load.
  }
  teamListeners.forEach(listener => listener());
}

// The reader's own Hive team, read once per page load and shared by the
// header and every tab: `undefined` until read, then the team or `null`.
let ownTeam: string | null | undefined;
let ownTeamRead: Promise<void> | undefined;
const ownTeamListeners = new Set<() => void>();

function subscribeOwnTeam(listener: () => void) {
  ownTeamListeners.add(listener);
  return () => ownTeamListeners.delete(listener);
}

const getOwnTeamSnapshot = () => ownTeam;

async function readOwnTeam(
  identityApi: IdentityApi,
  catalogApi: CatalogApi | undefined,
): Promise<string | null> {
  const identity = await identityApi.getBackstageIdentity();
  const slugs = identity.ownershipEntityRefs
    .map(teamSlugOfGroupRef)
    .filter((slug): slug is string => Boolean(slug));
  // The identity carries the groups only when the sign-in matched a catalog
  // user; the catalog's `hasMember` answers otherwise (as on Bot PRs). A
  // catalog that fails leaves the identity's groups to decide.
  if (catalogApi) {
    try {
      const groups = await catalogApi.getEntities({
        filter: {
          kind: 'Group',
          'spec.type': 'team',
          'relations.hasMember': identity.userEntityRef,
        },
        fields: ['metadata.name'],
      });
      for (const group of groups.items) {
        const slug = teamSlugOfGroupRef(`group:default/${group.metadata.name}`);
        if (slug) {
          slugs.push(slug);
        }
      }
    } catch {
      // The identity's groups, if any, still answer.
    }
  }
  return ownHiveTeamOf(slugs) ?? null;
}

/**
 * The reader's own Hive team from their catalog groups (`team-shield` →
 * `Shield 🛡️`), `null` when they are in none of Hive's teams, `undefined`
 * while it is read. Without the identity API (a tab rendered alone in a
 * test), `null` at once. A read that fails answers `null` for now and is
 * tried again by the next component that mounts.
 */
function useOwnHiveTeam(): string | null | undefined {
  const apis = useApiHolder();
  const identityApi = apis.get(identityApiRef);
  const catalogApi = apis.get(catalogApiRef);
  useEffect(() => {
    if (!identityApi || ownTeamRead) {
      return;
    }
    ownTeamRead = readOwnTeam(identityApi, catalogApi)
      .catch(() => {
        ownTeamRead = undefined;
        return null;
      })
      .then(team => {
        ownTeam = team;
        ownTeamListeners.forEach(listener => listener());
      });
  }, [identityApi, catalogApi]);
  const team = useSyncExternalStore(
    subscribeOwnTeam,
    getOwnTeamSnapshot,
    getOwnTeamSnapshot,
  );
  return identityApi ? team : null;
}

export type HiveTeamScope = [
  team: string,
  setTeam: (team: string) => void,
  /**
   * Whether `team` is final: the URL names one, the reader picked one, or
   * their own team has been read. Before that it is `DEFAULT_TEAM`, which a
   * tab should not load.
   */
  isResolved: boolean,
];

/**
 * The team every Hive tab is scoped to: `?team=` while the URL names one,
 * else the one the reader picked in the header (localStorage, across
 * visits), else the reader's own team from the catalog, else
 * `DEFAULT_TEAM`. `ALL_TEAMS` for every team. Only a pick in the header is
 * saved: a link's `?team=` scopes the page it opens and nothing more, so an
 * old link that carries Bumblebee does not become the reader's team.
 */
export function useHiveTeam(): HiveTeamScope {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTeam = searchParams.get(TEAM_SEARCH_PARAM);
  const picked = useSyncExternalStore(
    subscribeTeam,
    getTeamSnapshot,
    getTeamSnapshot,
  );
  const own = useOwnHiveTeam();
  const shown = picked ?? own ?? DEFAULT_TEAM;

  const setTeam = useCallback(
    (next: string) => {
      storeTeam(next);
      setSearchParams(
        prev => {
          const params = new URLSearchParams(prev);
          params.set(TEAM_SEARCH_PARAM, next);
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  return [
    urlTeam ?? shown,
    setTeam,
    urlTeam !== null || picked !== undefined || own !== undefined,
  ];
}

/**
 * Writes the shown team into `?team=` without making it the reader's pick,
 * so a tab that reads the URL (the roadmap's board) follows the header and a
 * copied link carries the team.
 */
export function useShowHiveTeamInUrl(): (team: string) => void {
  const [, setSearchParams] = useSearchParams();
  return useCallback(
    (team: string) =>
      setSearchParams(
        prev => {
          const params = new URLSearchParams(prev);
          params.set(TEAM_SEARCH_PARAM, team);
          return params;
        },
        { replace: true },
      ),
    [setSearchParams],
  );
}

/** The header search, in `?q=`; every tab filters what it lists by it. */
export function useHiveSearch(): [string, (query: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const setQuery = useCallback(
    (query: string) =>
      setSearchParams(
        prev => {
          const params = new URLSearchParams(prev);
          if (query) {
            params.set('q', query);
          } else {
            params.delete('q');
          }
          return params;
        },
        { replace: true },
      ),
    [setSearchParams],
  );
  return [searchParams.get('q') ?? '', setQuery];
}

// --- Data -----------------------------------------------------------------
//
// Hive reads the magazine repository (`plans.magazine` on the backend)
// through the plans API: the generated `magazine/*.json` on its data ref and
// the `knowledge/**` documents on its knowledge ref. The magazine writes one
// data set per team (`magazine/teams.json` lists them, each in
// `magazine/teams/<slug>/`) and the default team's again under `magazine/`.

/**
 * A magazine view scoped to a team, with the team the view's data set
 * follows. `view` is null when the magazine has no data set for the team.
 */
export interface ScopedView<T> {
  view: T | null;
  magazineTeam: string;
}

/**
 * `magazine/teams.json`, read once for every tab; null for a magazine that
 * writes the default team's set only.
 */
function readTeamSets(
  queryClient: QueryClient,
  plansApi: PlansApi,
): Promise<TeamSets | null> {
  return queryClient.fetchQuery({
    queryKey: ['plans', 'hive', 'teams'],
    queryFn: async () => {
      try {
        return await readMagazineJson<TeamSets>(plansApi, MAGAZINE_TEAMS_FILE);
      } catch (error) {
        if ((error as Error).name === 'NotFoundError') {
          return null;
        }
        throw error;
      }
    },
  });
}

/**
 * A view from the team's own data set, with the team it follows
 * (`meta.json`), which every item without a `team` belongs to. All teams,
 * and a magazine without per-team sets, read the default set under
 * `magazine/`; a team the magazine lists no set for has no view.
 */
async function readScoped<T>(
  queryClient: QueryClient,
  plansApi: PlansApi,
  view: 'now' | HistoryWindow,
  team: string,
): Promise<ScopedView<T>> {
  let folder: string | undefined;
  if (team !== ALL_TEAMS) {
    const sets = await readTeamSets(queryClient, plansApi);
    if (sets) {
      const set = teamSetFor(sets, team);
      if (!set) {
        return { view: null, magazineTeam: team };
      }
      folder = set.path;
    }
  }
  const [data, meta] = await Promise.all([
    readMagazineJson<T>(plansApi, magazineFile(view, folder)),
    readMagazineJson<Meta>(plansApi, magazineFile('meta', folder)),
  ]);
  return { view: data, magazineTeam: meta.sources.team };
}

/** Now (`now.json` of the team's data set), scoped to a team. */
export function useHiveNow(team: string, enabled = true) {
  const plansApi = useApi(plansApiRef);
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ['plans', 'hive', 'now', team],
    enabled,
    queryFn: () => readScoped<Now>(queryClient, plansApi, 'now', team),
    select: ({ view, magazineTeam }): ScopedView<Now> => ({
      view: view && nowForTeam(view, team, magazineTeam),
      magazineTeam,
    }),
  });
}

/** Hive's history (`history-weeks.json` of the team's data set), scoped to a team. */
export function useHiveHistory(team: string, enabled = true) {
  const plansApi = useApi(plansApiRef);
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ['plans', 'hive', 'history', team],
    enabled,
    queryFn: () =>
      readScoped<History>(queryClient, plansApi, HIVE_HISTORY_WINDOW, team),
    select: ({ view, magazineTeam }): ScopedView<History> => ({
      view: view && historyForTeam(view, team, magazineTeam),
      magazineTeam,
    }),
  });
}

/** The knowledge documents by category. */
export function useHiveKnowledgeDocs() {
  const plansApi = useApi(plansApiRef);
  return useQuery({
    queryKey: ['plans', 'hive', 'knowledge'],
    queryFn: async (): Promise<Record<KnowledgeCategory, KnowledgeDoc[]>> => {
      const { repository, knowledgeRef } = await magazineRefs(plansApi);
      const { tree } = await plansApi.getTree(knowledgeRef, repository);
      return knowledgeDocs(tree);
    },
  });
}

/** One knowledge document's markdown. */
export function useHiveKnowledgeDoc(path: string) {
  const plansApi = useApi(plansApiRef);
  return useQuery({
    queryKey: ['plans', 'hive', 'knowledge-doc', path],
    queryFn: async (): Promise<string> => {
      const { repository, knowledgeRef } = await magazineRefs(plansApi);
      const { content } = await plansApi.getContent(
        path,
        knowledgeRef,
        repository,
      );
      return content;
    },
  });
}
