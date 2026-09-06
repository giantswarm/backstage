import { act, renderHook } from '@testing-library/react';
import type {
  InstallationInventory,
  InstallationInventoryEntry,
} from '../installationInventory/types';
import {
  __resetInstallationsConfigForTests,
  setInstallationsConfig,
} from '../installations';
import {
  __resetInstallationScopeForTests,
  ALL_INSTALLATIONS,
  getInstallationScopeSnapshot,
  INSTALLATION_SCOPE_STORAGE_KEY,
} from './installationScopeStore';
import { useInstallationScope } from './useInstallationScope';

// The inventory needs a react-query client and three Backstage APIs; here it
// is whatever the test says. `mock`-prefixed, as jest requires in a factory.
let mockInventory: Pick<InstallationInventory, 'entries' | 'home' | 'isLoading'>;

jest.mock('../installationInventory/useInstallationInventory', () => ({
  useInstallationInventory: () => ({
    ...mockInventory,
    isProbing: false,
    installationsWith: () => [],
    refresh: () => {},
  }),
}));

function entry(
  installation: string,
  overrides: Partial<InstallationInventoryEntry> = {},
): InstallationInventoryEntry {
  return {
    installation,
    home: false,
    accessState: 'healthy',
    probe: 'answered',
    components: { kagent: true, muster: false, kserve: false, capi: true },
    ...overrides,
  };
}

const golem = entry('golem', { home: true });
const wombat = entry('wombat');
const snail = entry('snail', {
  components: { kagent: false, muster: false, kserve: false, capi: true },
});

function configure(names: string[]) {
  setInstallationsConfig(
    names.map(name => ({ name, oidcTokenProvider: `oidc-${name}` })),
  );
}

describe('useInstallationScope', () => {
  beforeEach(() => {
    window.localStorage.clear();
    __resetInstallationScopeForTests();
    __resetInstallationsConfigForTests();
    mockInventory = { entries: [golem, wombat, snail], home: 'golem', isLoading: false };
  });

  it('defaults to all installations and lists the platform ones, home first', () => {
    configure(['golem', 'wombat', 'snail']);

    const { result } = renderHook(() => useInstallationScope());

    expect(result.current.scope).toBe(ALL_INSTALLATIONS);
    expect(result.current.installations.map(e => e.installation)).toEqual([
      'golem',
      'wombat',
    ]);
    expect(result.current.home).toBe('golem');
    expect(result.current.isSingleInstallation).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it('pins an installation through setScope and shares it across hook instances', () => {
    configure(['golem', 'wombat', 'snail']);
    const first = renderHook(() => useInstallationScope());
    const second = renderHook(() => useInstallationScope());

    act(() => first.result.current.setScope('wombat'));

    expect(first.result.current.scope).toBe('wombat');
    expect(second.result.current.scope).toBe('wombat');
    expect(window.localStorage.getItem(INSTALLATION_SCOPE_STORAGE_KEY)).toBe(
      'wombat',
    );
  });

  it('restores a stored choice of another installation', () => {
    window.localStorage.setItem(INSTALLATION_SCOPE_STORAGE_KEY, 'wombat');
    configure(['golem', 'wombat', 'snail']);

    const { result } = renderHook(() => useInstallationScope());

    expect(result.current.scope).toBe('wombat');
    // Confirmed once the config is known: no longer a mere restore.
    expect(getInstallationScopeSnapshot()).toEqual({
      scope: 'wombat',
      restored: false,
    });
  });

  it('reads a stored home installation as all -- the muster picker wrote that for everyone', () => {
    window.localStorage.setItem(INSTALLATION_SCOPE_STORAGE_KEY, 'golem');
    configure(['golem', 'wombat', 'snail']);

    const { result } = renderHook(() => useInstallationScope());

    expect(result.current.scope).toBe(ALL_INSTALLATIONS);
    expect(getInstallationScopeSnapshot().scope).toBe(ALL_INSTALLATIONS);
    expect(
      window.localStorage.getItem(INSTALLATION_SCOPE_STORAGE_KEY),
    ).toBeNull();
  });

  it('keeps a home installation pinned deliberately in this session', () => {
    configure(['golem', 'wombat', 'snail']);
    const { result } = renderHook(() => useInstallationScope());

    act(() => result.current.setScope('golem'));

    expect(result.current.scope).toBe('golem');
  });

  it('does not touch a restored value before the installations config is known', () => {
    window.localStorage.setItem(INSTALLATION_SCOPE_STORAGE_KEY, 'golem');
    mockInventory = { entries: [], home: undefined, isLoading: true };

    const { result } = renderHook(() => useInstallationScope());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.isSingleInstallation).toBe(false);
    expect(getInstallationScopeSnapshot()).toEqual({
      scope: 'golem',
      restored: true,
    });
  });

  it('is a single installation on a portal that knows one', () => {
    configure(['golem']);
    mockInventory = { entries: [golem], home: 'golem', isLoading: false };

    const { result } = renderHook(() => useInstallationScope());

    expect(result.current.isSingleInstallation).toBe(true);
    expect(result.current.installations.map(e => e.installation)).toEqual([
      'golem',
    ]);
  });
});
