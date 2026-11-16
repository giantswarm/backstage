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

export function isFixtureScenario(value: unknown): value is FixtureScenario {
  return FIXTURE_SCENARIOS.includes(value as FixtureScenario);
}

function keepForTab(scenario: FixtureScenario): void {
  try {
    window.sessionStorage.setItem(TAB_SCENARIO_KEY, scenario);
  } catch {
    // Without storage the scenario lasts until the page reloads.
  }
}

/**
 * The fixture scenario the URL and the tab name: the one the `fixtures`
 * query parameter names, kept for the tab, else the tab's, else `base`. A
 * name fixture mode does not know serves `base`, for the tab too, with a
 * console error. Reads them each time: {@link fixtureScenarioOfPage} is the
 * page's.
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
      keepForTab('base');
      return 'base';
    }
    keepForTab(asked);
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

let pageScenario: FixtureScenario | undefined;

/**
 * The fixture scenario of this page load, read once
 * ({@link readFixtureScenario}): every fixture API and the persisted query
 * caches serve the same one while the app navigates without the parameter.
 * The app reads it as it starts, before any redirect can drop the
 * parameter; loading a URL with another value switches it, without
 * restarting the server.
 */
export function fixtureScenarioOfPage(): FixtureScenario {
  pageScenario ??= readFixtureScenario();
  return pageScenario;
}

/** Sets the page's scenario, for tests; `undefined` reads it again. */
export function setFixtureScenarioOfPageForTests(
  scenario: FixtureScenario | undefined,
): void {
  pageScenario = scenario;
}

/**
 * The `buster` of a persisted query cache: `buster`, and outside production
 * builds the page's fixture scenario unless it is `base`. A cache written
 * under another scenario, by this tab or another one, is then never
 * restored: an `error` page would otherwise show the rows a `many` page
 * cached.
 */
export function fixtureScenarioCacheBuster(buster = ''): string {
  if (process.env.NODE_ENV === 'production') {
    return buster;
  }
  const scenario = fixtureScenarioOfPage();
  return scenario === 'base' ? buster : `${buster}#fixtures=${scenario}`;
}
