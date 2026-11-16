import {
  fixtureScenarioCacheBuster,
  fixtureScenarioOfPage,
  readFixtureScenario,
  setFixtureScenarioOfPageForTests,
} from './fixtureMode';

function load(search: string) {
  window.history.replaceState(null, '', `/agents${search}`);
  setFixtureScenarioOfPageForTests(undefined);
}

describe('fixture scenarios at page load', () => {
  afterEach(() => {
    window.sessionStorage.clear();
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

  it('serves base for a name it does not know, for the tab too', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    load('?fixtures=error');
    expect(readFixtureScenario()).toBe('error');
    load('?fixtures=bogus');
    expect(readFixtureScenario()).toBe('base');
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('no scenario bogus'),
    );
    // The app navigates without the parameter, and the page reloads.
    load('');
    expect(readFixtureScenario()).toBe('base');
    error.mockRestore();
  });

  it('keeps the page’s scenario once read, whatever the URL says later', () => {
    load('?fixtures=many');
    expect(fixtureScenarioOfPage()).toBe('many');
    window.history.replaceState(null, '', '/customize/agents');
    window.sessionStorage.clear();
    expect(fixtureScenarioOfPage()).toBe('many');
  });

  it('busts the persisted caches of every scenario but base', () => {
    load('');
    expect(fixtureScenarioCacheBuster('v1')).toBe('v1');
    expect(fixtureScenarioCacheBuster()).toBe('');
    load('?fixtures=error');
    expect(fixtureScenarioCacheBuster('v1')).toBe('v1#fixtures=error');
    load('?fixtures=many');
    expect(fixtureScenarioCacheBuster()).toBe('#fixtures=many');
  });
});
