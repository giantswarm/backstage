import { renderHook } from '@testing-library/react';
import { useUsageInstallation } from './useUsageInstallation';

const state = {
  withKagent: ['gazelle', 'golem'] as string[],
  entries: ['gazelle', 'golem', 'wombat'] as string[],
  home: 'gazelle' as string | undefined,
  scope: 'all' as string,
  isSingleInstallation: false,
  isLoading: false,
  isProbing: false,
  proxied: ['gazelle', 'golem'] as string[],
  notReachable: [] as string[],
  allowlistLoading: false,
  allowlistFailed: false,
};

jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  ALL_INSTALLATIONS: 'all',
  applyInstallationScope: (installations: string[], scope: string) =>
    scope === 'all'
      ? installations
      : installations.filter(installation => installation === scope),
  useInstallationInventory: () => ({
    entries: state.entries.map(name => ({ name })),
    home: state.home,
    isLoading: state.isLoading,
    isProbing: state.isProbing,
    installationsWith: (component: string) =>
      component === 'kagent' ? state.withKagent : [],
    refresh: () => {},
  }),
  useInstallationScope: () => ({
    scope: state.scope,
    home: state.home,
    isSingleInstallation: state.isSingleInstallation,
    installations: [],
    setScope: () => {},
    isLoading: state.isLoading,
  }),
}));

jest.mock('./useKagentInstallations', () => ({
  useKagentInstallations: () => ({
    installations: state.proxied.map(name => ({ name, reachable: true })),
    proxied: state.proxied,
    notReachable: state.notReachable,
    isLoading: state.allowlistLoading,
    isError: state.allowlistFailed,
  }),
}));

const DEFAULTS = { ...state };

beforeEach(() => {
  Object.assign(state, DEFAULTS);
});

function render() {
  return renderHook(() => useUsageInstallation()).result;
}

describe('useUsageInstallation', () => {
  it('prefers the home installation under the "all" scope', () => {
    const { current } = render();

    expect(current.installation).toBe('gazelle');
    expect(current.candidates).toEqual(['gazelle', 'golem']);
    // The page chose on the user's behalf, so it has to say which one.
    expect(current.isResolvedFromAll).toBe(true);
  });

  it('honours a pinned scope', () => {
    state.scope = 'golem';
    const { current } = render();

    expect(current.installation).toBe('golem');
    // Their choice, so there is nothing to explain.
    expect(current.isResolvedFromAll).toBe(false);
  });

  it('resolves nothing when the pinned installation does not run kagent', () => {
    // The scope is section-wide, so it can point at an installation this tab
    // cannot read. It resolves to *nothing* rather than falling back: the pin is
    // a deliberate choice, and quietly reporting another installation's usage
    // under it would misattribute someone's tokens. The page says "kagent is
    // not installed on wombat" instead.
    state.scope = 'wombat';
    const { current } = render();

    expect(current.installation).toBeUndefined();
    expect(current.candidates).toEqual([]);
  });

  it('takes the first candidate when home does not run kagent', () => {
    state.home = 'wombat';
    state.withKagent = ['golem'];
    state.proxied = ['golem'];
    const { current } = render();

    expect(current.installation).toBe('golem');
  });

  it('reports an unreachable installation without querying it', () => {
    state.proxied = ['gazelle'];
    state.notReachable = ['golem'];
    const { current } = render();

    expect(current.candidates).toEqual(['gazelle']);
    expect(current.notReachable).toEqual(['golem']);
  });

  it('does not report an unreachable installation that has no kagent', () => {
    // A derived-but-unreachable kagent URL on an installation without kagent is
    // nothing to tell anyone about.
    state.notReachable = ['wombat'];
    const { current } = render();

    expect(current.notReachable).toEqual([]);
  });

  it('keeps the inventory’s candidates when the backend list fails', () => {
    // A backend hiccup must not look like "you have no usage".
    state.allowlistFailed = true;
    state.proxied = [];
    const { current } = render();

    expect(current.candidates).toEqual(['gazelle', 'golem']);
    expect(current.installation).toBe('gazelle');
  });

  it('explains nothing on a single-installation portal', () => {
    state.isSingleInstallation = true;
    state.withKagent = ['gazelle'];
    state.proxied = ['gazelle'];
    const { current } = render();

    expect(current.installation).toBe('gazelle');
    expect(current.isResolvedFromAll).toBe(false);
  });

  it('explains nothing when only one installation runs kagent', () => {
    // There is no other choice to point at, so the note would be noise.
    state.withKagent = ['gazelle'];
    state.proxied = ['gazelle'];
    const { current } = render();

    expect(current.isResolvedFromAll).toBe(false);
  });

  it('reports no installations when the portal knows none', () => {
    state.entries = [];
    state.withKagent = [];
    state.proxied = [];
    const { current } = render();

    expect(current.hasInstallations).toBe(false);
    expect(current.installation).toBeUndefined();
  });

  it('is loading while the inventory is still probing', () => {
    state.isProbing = true;
    const { current } = render();

    expect(current.isLoading).toBe(true);
  });
});
