/**
 * The made-up installations fixture mode serves (docs/fixtures.md). Every
 * fixture API (gs's Kubernetes API and cluster access, muster,
 * agent-platform) serves these and fails loudly for any other;
 * `app-config.fixtures.yaml` names them in `gs.installations`, which a test
 * checks.
 */
export const FIXTURE_INSTALLATIONS = ['meadow', 'fennel', 'tarragon'] as const;

/** The first of {@link FIXTURE_INSTALLATIONS}, reachable in every data set. */
export const FIXTURE_INSTALLATION = FIXTURE_INSTALLATIONS[0];

/** Whether fixture mode serves an installation. */
export function isFixtureInstallation(installation: string): boolean {
  return (FIXTURE_INSTALLATIONS as readonly string[]).includes(installation);
}

/**
 * Where a plugin attaches the fixture MCP servers its pages call through
 * muster: the id of muster's extension data ref and the input of
 * `api:muster/muster` that reads it. Here rather than in the muster plugin so
 * a contributing plugin needs nothing of muster's at runtime: many tests mock
 * the muster package wholesale, which would leave an imported ref undefined
 * when the contributing plugin loads.
 */
export const FIXTURE_MCP_SERVERS = {
  dataRefId: 'muster.fixture-mcp-servers',
  attachTo: { id: 'api:muster/muster', input: 'fixtureServers' },
} as const;

/**
 * The data sets fixture mode serves, picked with the `fixtures` query
 * parameter (`?fixtures=many`; docs/fixtures.md):
 *
 * - `base` -- the base data set, every state of every list.
 * - `empty` -- the installations, and nothing in them.
 * - `many` -- hundreds of items in each list a page shows.
 * - `long-names` -- every name as long as Kubernetes allows.
 * - `loading` -- the base data set, but no call ever answers.
 * - `error` -- every call fails; muster's with its own errors.
 */
export const FIXTURE_SCENARIOS = [
  'base',
  'empty',
  'many',
  'long-names',
  'loading',
  'error',
] as const;
export type FixtureScenario = (typeof FIXTURE_SCENARIOS)[number];

/** The query parameter that picks the fixture scenario. */
export const FIXTURE_SCENARIO_PARAM = 'fixtures';

/** Where a tab keeps its scenario (sessionStorage). */
const TAB_SCENARIO_KEY = 'giantswarm.fixtures.scenario';

/** The scenario the persisted query caches were written under (localStorage). */
const CACHE_SCENARIO_KEY = 'giantswarm.fixtures.cacheScenario';

/** What the query caches the plugins persist to localStorage are named. */
const PERSISTED_QUERY_CACHE = /react-query-cache$/;

export function isFixtureScenario(value: unknown): value is FixtureScenario {
  return FIXTURE_SCENARIOS.includes(value as FixtureScenario);
}

/**
 * The fixture scenario of this page load: the one the `fixtures` query
 * parameter names, kept for the tab, else the tab's, else `base`. A name
 * fixture mode does not know serves `base`, with a console error.
 */
export function readFixtureScenario(): FixtureScenario {
  if (typeof window === 'undefined') {
    return 'base';
  }
  const asked = new URLSearchParams(window.location.search).get(
    FIXTURE_SCENARIO_PARAM,
  );
  if (asked !== null) {
    if (!isFixtureScenario(asked)) {
      // eslint-disable-next-line no-console
      console.error(
        `Fixture mode has no scenario ${asked}, only ${FIXTURE_SCENARIOS.join(', ')}: serving base.`,
      );
      return 'base';
    }
    try {
      window.sessionStorage.setItem(TAB_SCENARIO_KEY, asked);
    } catch {
      // Without storage the scenario lasts until the page reloads.
    }
    return asked;
  }
  try {
    const kept = window.sessionStorage.getItem(TAB_SCENARIO_KEY);
    if (isFixtureScenario(kept)) {
      return kept;
    }
  } catch {
    // No storage: the base scenario.
  }
  return 'base';
}

/**
 * Drops the query caches the plugins persist to localStorage when they were
 * written under another fixture scenario than this page load's: they are
 * restored before any fixture API answers, so an `error` page would show the
 * rows a `base` page cached. Call it before the app renders. Without a
 * scenario ever picked it does nothing.
 */
export function dropQueryCachesOfOtherFixtureScenario(): void {
  try {
    const scenario = readFixtureScenario();
    const storage = window.localStorage;
    const written = storage.getItem(CACHE_SCENARIO_KEY) ?? 'base';
    if (written === scenario) {
      return;
    }
    for (let i = storage.length - 1; i >= 0; i--) {
      const key = storage.key(i);
      if (key && PERSISTED_QUERY_CACHE.test(key)) {
        storage.removeItem(key);
      }
    }
    storage.setItem(CACHE_SCENARIO_KEY, scenario);
  } catch {
    // No storage: nothing persisted to drop.
  }
}
