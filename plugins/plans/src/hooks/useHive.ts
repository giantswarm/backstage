import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useApi } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { PlansApi, plansApiRef } from '../apis';
import { DEFAULT_TEAM, historyForTeam, nowForTeam } from '../lib/hive';
import {
  History,
  HistoryWindow,
  KnowledgeCategory,
  KnowledgeDoc,
  knowledgeDocs,
  magazineFile,
  Now,
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

const TEAM_STORAGE_KEY = 'plans.hive.team';
const TEAM_SEARCH_PARAM = 'team';
const teamListeners = new Set<() => void>();

function readStoredTeam(): string {
  try {
    return window.localStorage.getItem(TEAM_STORAGE_KEY) ?? DEFAULT_TEAM;
  } catch {
    return DEFAULT_TEAM;
  }
}

let storedTeam: string | undefined;

function getTeamSnapshot(): string {
  if (storedTeam === undefined) {
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

/**
 * The team every Hive tab is scoped to: chosen once in the header, kept in
 * `?team=` for a shared link and in localStorage across visits, so it
 * follows the reader from tab to tab. `ALL_TEAMS` for every team.
 */
export function useHiveTeam(): [string, (team: string) => void] {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { search, hash } = useLocation();
  const urlTeam = searchParams.get(TEAM_SEARCH_PARAM);
  const team = useSyncExternalStore(
    subscribeTeam,
    getTeamSnapshot,
    getTeamSnapshot,
  );

  // A link that names a team wins over the stored choice and becomes it.
  useEffect(() => {
    if (urlTeam && urlTeam !== getTeamSnapshot()) {
      storeTeam(urlTeam);
    }
  }, [urlTeam]);

  // Keeps the hash: an old `/plans` link lands on the Plans section.
  const setTeam = useCallback(
    (next: string) => {
      storeTeam(next);
      const params = new URLSearchParams(search);
      params.set(TEAM_SEARCH_PARAM, next);
      navigate({ search: params.toString(), hash }, { replace: true });
    },
    [navigate, search, hash],
  );

  return [urlTeam ?? team, setTeam];
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
// the `knowledge/**` documents on its knowledge ref.

/** Now (`magazine/now.json`), scoped to a team. */
export function useHiveNow(team: string) {
  const plansApi = useApi(plansApiRef);
  return useQuery({
    queryKey: ['plans', 'hive', 'now'],
    queryFn: () => readMagazineJson<Now>(plansApi, magazineFile('now')),
    select: now => nowForTeam(now, team),
  });
}

/** One history window (`magazine/history-<window>.json`), scoped to a team. */
export function useHiveHistory(window: HistoryWindow, team: string) {
  const plansApi = useApi(plansApiRef);
  return useQuery({
    queryKey: ['plans', 'hive', 'history', window],
    queryFn: () => readMagazineJson<History>(plansApi, magazineFile(window)),
    select: history => historyForTeam(history, team),
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
