import {
  dropQueryCachesOfOtherFixtureScenario,
  readFixtureScenario,
} from './fixtureMode';

function load(search: string) {
  window.history.replaceState(null, '', `/agents${search}`);
}

describe('fixture scenarios at page load', () => {
  afterEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    load('');
  });

  it('reads the scenario from the URL, else the tab’s, else base', () => {
    load('');
    expect(readFixtureScenario()).toBe('base');
    load('?fixtures=empty');
    expect(readFixtureScenario()).toBe('empty');
    load('');
    expect(readFixtureScenario()).toBe('empty');
  });

  it('drops the persisted query caches of another scenario', () => {
    window.localStorage.setItem('agent-platform-react-query-cache', 'base');
    window.localStorage.setItem('gs-react-query-cache', 'base');
    window.localStorage.setItem('sidebarPinState', 'true');

    // Never picked a scenario: nothing is dropped.
    load('');
    dropQueryCachesOfOtherFixtureScenario();
    expect(window.localStorage.getItem('gs-react-query-cache')).toBe('base');

    load('?fixtures=error');
    dropQueryCachesOfOtherFixtureScenario();
    expect(
      window.localStorage.getItem('agent-platform-react-query-cache'),
    ).toBe(null);
    expect(window.localStorage.getItem('gs-react-query-cache')).toBe(null);
    expect(window.localStorage.getItem('sidebarPinState')).toBe('true');

    // The same scenario again keeps what it cached.
    window.localStorage.setItem('agent-platform-react-query-cache', 'error');
    load('');
    dropQueryCachesOfOtherFixtureScenario();
    expect(
      window.localStorage.getItem('agent-platform-react-query-cache'),
    ).toBe('error');

    load('?fixtures=base');
    dropQueryCachesOfOtherFixtureScenario();
    expect(
      window.localStorage.getItem('agent-platform-react-query-cache'),
    ).toBe(null);
  });
});
