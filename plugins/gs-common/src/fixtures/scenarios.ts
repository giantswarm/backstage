import { readFixtureScenario, type FixtureScenario } from '../fixtureMode';
import {
  baseDataSet,
  createFixtureDataSet,
  type FixtureDataSet,
  type FixtureDataSetSettings,
} from './dataSet';

let current: FixtureScenario | undefined;

const dataSets = new Map<FixtureScenario, FixtureDataSet>();

/**
 * The scenario this page serves: the one the `fixtures` query parameter of
 * the URL the page loaded with names, else the one the tab loaded last, else
 * `base`. Read once per page load, so every fixture API serves the same one
 * while the app navigates without the parameter; loading a URL with another
 * value switches it, without restarting the server.
 */
export function fixtureScenario(): FixtureScenario {
  current ??= readFixtureScenario();
  return current;
}

/** Sets the scenario, for tests; `undefined` reads it again. */
export function setFixtureScenarioForTests(
  scenario: FixtureScenario | undefined,
): void {
  current = scenario;
  dataSets.clear();
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
  hostedModels: { nameLength: LONG },
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
      `${api}.${method} failed: fixture scenario "error" fails every call.`,
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
