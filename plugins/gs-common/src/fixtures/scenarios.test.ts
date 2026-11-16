import { FIXTURE_INSTALLATIONS } from '../fixtureMode';
import { baseDataSet } from './dataSet';
import {
  fixtureDataSet,
  fixtureScenario,
  onFixtureScenarioReset,
  scenarioDataSet,
  setFixtureScenarioForTests,
  withFixtureScenario,
} from './scenarios';

function load(search: string) {
  window.history.replaceState(null, '', `/agents${search}`);
  setFixtureScenarioForTests(undefined);
}

describe('fixture scenarios', () => {
  afterEach(() => {
    window.sessionStorage.clear();
    load('');
  });

  it('serves the base data set without a parameter', () => {
    load('');
    expect(fixtureScenario()).toBe('base');
    expect(fixtureDataSet()).toBe(baseDataSet());
  });

  it('reads the scenario from the URL once, and keeps it for the tab', () => {
    load('?fixtures=many');
    expect(fixtureScenario()).toBe('many');
    // The app navigates without the parameter: the page keeps its scenario.
    window.history.replaceState(null, '', '/customize');
    expect(fixtureScenario()).toBe('many');
    // A reload without it keeps the tab's.
    load('');
    expect(fixtureScenario()).toBe('many');
    load('?fixtures=base');
    expect(fixtureScenario()).toBe('base');
  });

  it('serves base for a scenario it does not know, and says so', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    load('?fixtures=nope');
    expect(fixtureScenario()).toBe('base');
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('no scenario nope'),
    );
    error.mockRestore();
  });

  it('keeps the served installations in every data set', () => {
    for (const scenario of ['empty', 'many', 'long-names'] as const) {
      expect(scenarioDataSet(scenario).installations.map(i => i.name)).toEqual([
        ...FIXTURE_INSTALLATIONS,
      ]);
    }
  });

  it('has nothing in the installations of empty', () => {
    const {
      now: _now,
      installations,
      toolsetPresets,
      ...lists
    } = scenarioDataSet('empty');
    expect(installations).toHaveLength(FIXTURE_INSTALLATIONS.length);
    for (const [list, items] of Object.entries(lists)) {
      expect([list, items]).toEqual([list, []]);
    }
    expect(toolsetPresets).toEqual([]);
  });

  it('has hundreds of items in the lists of many', () => {
    const data = scenarioDataSet('many');
    const inMeadow = <T extends { installation: string }>(items: T[]) =>
      items.filter(item => item.installation === 'meadow').length;
    expect(inMeadow(data.agents)).toBeGreaterThanOrEqual(100);
    expect(inMeadow(data.connectors)).toBeGreaterThanOrEqual(100);
    expect(inMeadow(data.sessions)).toBeGreaterThanOrEqual(100);
    expect(inMeadow(data.workflows)).toBeGreaterThanOrEqual(100);
    expect(inMeadow(data.executions)).toBeGreaterThanOrEqual(100);
    expect(inMeadow(data.workspaces)).toBeGreaterThanOrEqual(100);
    expect(inMeadow(data.toolchains)).toBeGreaterThanOrEqual(100);
    expect(inMeadow(data.skillRepositories)).toBeGreaterThanOrEqual(30);
    expect(inMeadow(data.hostedModels)).toBeGreaterThanOrEqual(100);
    expect(data.repositories.length).toBeGreaterThanOrEqual(100);
  });

  it('makes every name of long-names as long as a Kubernetes name', () => {
    const data = scenarioDataSet('long-names');
    for (const list of [
      data.organizations,
      data.agents,
      data.connectors,
      data.workflows,
      data.workspaces,
      data.toolchainSources,
      data.gpuPools,
    ]) {
      for (const item of list) {
        expect(item.name.length).toBeGreaterThanOrEqual(60);
      }
    }
  });

  it('keeps the names of each list apart in long-names', () => {
    const data = scenarioDataSet('long-names');
    for (const list of [
      data.agents,
      data.connectors,
      data.workflows,
      data.gpuPools,
      data.hostedModels,
    ]) {
      const keys = list.map(item => `${item.installation}/${item.name}`);
      expect(new Set(keys).size).toBe(keys.length);
    }
    for (const pool of data.gpuPools) {
      expect(pool.name.startsWith(`${pool.cluster}-`)).toBe(true);
    }
  });

  it('gives cache claims long names in long-names', () => {
    const data = scenarioDataSet('long-names');
    // The mounted claim keeps the name the serving slice gives it.
    const unmounted = data.cacheClaims.filter(c => c.state !== 'mounted');
    expect(unmounted.length).toBeGreaterThan(0);
    for (const claim of unmounted) {
      expect(claim.name.length).toBeGreaterThanOrEqual(60);
    }
  });

  it('drops the registered states when a test switches the scenario', () => {
    let built: string | undefined;
    const stateOf = () => {
      built ??= fixtureScenario();
      return built;
    };
    onFixtureScenarioReset(() => {
      built = undefined;
    });
    setFixtureScenarioForTests('many');
    expect(stateOf()).toBe('many');
    setFixtureScenarioForTests('empty');
    expect(stateOf()).toBe('empty');
    expect(fixtureDataSet()).toBe(scenarioDataSet('empty'));
  });

  describe('withFixtureScenario', () => {
    class Api {
      constructor(private readonly answer: string) {}
      async read() {
        return this.answer;
      }
      async write() {
        return `written ${await this.own()}`;
      }
      async own() {
        return this.answer;
      }
    }

    it('is the API itself in a data scenario', () => {
      load('?fixtures=many');
      const api = new Api('x');
      expect(withFixtureScenario('Api', api)).toBe(api);
    });

    it('never answers in loading', async () => {
      load('?fixtures=loading');
      const api = withFixtureScenario('Api', new Api('x'));
      const settled = jest.fn();
      api.read().then(settled, settled);
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(settled).not.toHaveBeenCalled();
    });

    it('fails every call in error, or leaves it to the API', async () => {
      load('?fixtures=error');
      await expect(
        withFixtureScenario('Api', new Api('x')).read(),
      ).rejects.toMatchObject({
        status: 500,
        message: expect.stringContaining('Api.read failed'),
      });
      const own = withFixtureScenario('Api', new Api('x'), method =>
        method === 'read' ? undefined : new Error('own'),
      );
      await expect(own.read()).resolves.toBe('x');
      await expect(own.own()).rejects.toThrow('own');
      const write = withFixtureScenario('Api', new Api('x'), method =>
        method === 'write' ? undefined : new Error('own'),
      );
      // Its own calls of its members reach the API, not the scenario.
      await expect(write.write()).resolves.toBe('written x');
    });
  });
});
