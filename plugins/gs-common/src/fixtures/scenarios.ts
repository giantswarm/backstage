import {
  fixtureScenarioOfPage,
  setFixtureScenarioOfPageForTests,
  type FixtureScenario,
} from '../fixtureMode';
import {
  baseDataSet,
  createFixtureDataSet,
  type FixtureDataSet,
  type FixtureDataSetSettings,
} from './dataSet';

const dataSets = new Map<FixtureScenario, FixtureDataSet>();

/** What {@link setFixtureScenarioForTests} resets besides the data sets. */
const resets = new Set<() => void>();

/**
 * The scenario this page serves ({@link fixtureScenarioOfPage}): read once
 * per page load, as the app starts.
 */
export function fixtureScenario(): FixtureScenario {
  return fixtureScenarioOfPage();
}

/**
 * Registers how to drop a state built from {@link fixtureDataSet}, such as
 * a module's shared fixture state, so a test that switches the scenario
 * gets one built from the new data set. Every module-level state built from
 * the data set registers one.
 */
export function onFixtureScenarioReset(reset: () => void): void {
  resets.add(reset);
}

/**
 * Sets the scenario, for tests; `undefined` reads it again. Drops the data
 * sets and every state registered with {@link onFixtureScenarioReset}.
 */
export function setFixtureScenarioForTests(
  scenario: FixtureScenario | undefined,
): void {
  setFixtureScenarioOfPageForTests(scenario);
  dataSets.clear();
  resets.forEach(reset => reset());
}

const EMPTY: FixtureDataSetSettings = {
  organizations: { count: 0 },
  connectors: { count: 0 },
  workflows: { count: 0 },
  turnSessions: { count: 0 },
  repositoryOwners: { count: 0 },
  toolchainSources: { count: 0 },
  skillRepositories: { count: 0 },
  modelBackends: { count: 0 },
  clusters: { count: 0 },
  managementClusters: false,
  rbacSubjects: { count: 0 },
};

/** Hundreds of items in each list, per installation. */
const MANY: FixtureDataSetSettings = {
  organizations: { count: 25 },
  agents: { count: 12 },
  connectors: { count: 200 },
  sessions: { count: 20 },
  workflows: { count: 120 },
  repositories: { count: 100 },
  workspaces: { count: 12 },
  toolchainSources: { count: 12 },
  toolchains: { count: 30 },
  skillRepositories: { count: 30 },
  skills: { count: 20 },
  gpuPools: { count: 30 },
  cacheClaims: { count: 30 },
  hostedModels: { count: 100 },
  clusters: { count: 100 },
  busiestCluster: { pools: 30, nodes: 40 },
  rbacSubjects: { count: 150 },
};

/** Every name as long as a Kubernetes name may be. */
const LONG = 63;
const LONG_NAMES: FixtureDataSetSettings = {
  organizations: { nameLength: LONG },
  agents: { nameLength: LONG },
  connectors: { nameLength: LONG },
  sessions: { nameLength: LONG },
  turnSessions: { nameLength: LONG },
  workflows: { nameLength: LONG },
  repositoryOwners: { nameLength: LONG },
  repositories: { nameLength: LONG },
  workspaces: { nameLength: LONG },
  toolchainSources: { nameLength: LONG },
  toolchains: { nameLength: LONG },
  skillRepositories: { nameLength: LONG },
  skills: { nameLength: LONG },
  // A pool's name starts with its cluster's: a cluster name of 63 would
  // leave its pools none.
  gpuClusters: { nameLength: 40 },
  gpuPools: { nameLength: LONG },
  cacheClaims: { nameLength: LONG },
  hostedModels: { nameLength: LONG },
  clusters: { nameLength: LONG },
  rbacSubjects: { nameLength: LONG },
};

const SETTINGS: Partial<Record<FixtureScenario, FixtureDataSetSettings>> = {
  empty: EMPTY,
  many: MANY,
  'long-names': LONG_NAMES,
};

/** The data set of a scenario, built once; `loading` and `error` have the base one. */
export function scenarioDataSet(scenario: FixtureScenario): FixtureDataSet {
  const settings = SETTINGS[scenario];
  if (!settings) {
    return baseDataSet();
  }
  let data = dataSets.get(scenario);
  if (!data) {
    data = createFixtureDataSet(settings);
    if (scenario === 'empty') {
      // The presets are made, not counted: an empty muster has none.
      data = { ...data, toolsetPresets: [] };
    }
    dataSets.set(scenario, data);
  }
  return data;
}

/**
 * The data set every fixture API and tool handler reads: the one of the
 * page's {@link fixtureScenario}.
 */
export function fixtureDataSet(): FixtureDataSet {
  return scenarioDataSet(fixtureScenario());
}

/** The error of a call in the `error` scenario, unless the API names its own. */
export function fixtureScenarioError(api: string, method: string): Error {
  return Object.assign(
    new Error(
      `${api}.${method} failed: the error fixture scenario fails every call.`,
    ),
    { name: 'InternalServerError', status: 500 },
  );
}

/**
 * An API as the page's scenario serves it: in `loading`, each method answers
 * a promise that never settles; in `error`, each fails with what `errorOf`
 * answers ({@link fixtureScenarioError} by default), or is left to the API
 * where it answers `undefined`, for an API that fails in its own words; in
 * any other, the API itself. Every member of the API must be a method
 * returning a promise, as `lazyApi` requires.
 */
export function withFixtureScenario<T extends object>(
  name: string,
  api: T,
  errorOf: (method: string) => Error | undefined = method =>
    fixtureScenarioError(name, method),
): T {
  const scenario = fixtureScenario();
  if (scenario !== 'loading' && scenario !== 'error') {
    return api;
  }
  return new Proxy(api, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (
        typeof value !== 'function' ||
        typeof property !== 'string' ||
        property in Object.prototype
      ) {
        return value;
      }
      if (scenario === 'loading') {
        return () => new Promise(() => {});
      }
      const error = errorOf(property);
      // Bound to the API itself, so its own calls of its members are not
      // the scenario's.
      return error ? () => Promise.reject(error) : value.bind(target);
    },
  });
}
