import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
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
let mockInventory: Pick<
  InstallationInventory,
  'entries' | 'home' | 'isLoading'
>;

jest.mock('../installationInventory/useInstallationInventory', () => ({
  useInstallationInventory: () => ({
    ...mockInventory,
    isProbing: false,
    installationsWith: () => [],
    refresh: () => {},
  }),
}));

// The installations switched off in the sidebar Cluster access widget. The real
// hook reads a Backstage API and returns a contents-stable array; here the test
// sets the array, and keeps its identity stable within a test the same way.
let mockMuted: string[] = [];

jest.mock('../mutedInstallations', () => ({
  useMutedInstallations: () => mockMuted,
}));

function entry(
  installation: string,
  overrides: Partial<InstallationInventoryEntry> = {},
): InstallationInventoryEntry {
  return {
    installation,
    home: false,
    accessState: 'healthy',
    muted: false,
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

function renderScope(url = '/agent-platform/agents') {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
  );
  return renderHook(
    () => ({ scope: useInstallationScope(), search: useLocation().search }),
    { wrapper },
  );
}

describe('useInstallationScope', () => {
  beforeEach(() => {
    window.localStorage.clear();
    __resetInstallationScopeForTests();
    __resetInstallationsConfigForTests();
    mockMuted = [];
    mockInventory = {
      entries: [golem, wombat, snail],
      home: 'golem',
      isLoading: false,
    };
  });

  it('defaults to all installations and lists the platform ones, home first', () => {
    configure(['golem', 'wombat', 'snail']);

    const { result } = renderScope();

    expect(result.current.scope.scope).toBe(ALL_INSTALLATIONS);
    expect(result.current.scope.installations.map(e => e.installation)).toEqual(
      ['golem', 'wombat'],
    );
    expect(result.current.scope.home).toBe('golem');
    expect(result.current.scope.isSingleInstallation).toBe(false);
    expect(result.current.scope.isLoading).toBe(false);
    expect(result.current.search).toBe('');
  });

  it('pins an installation through setScope: store, localStorage and URL, for every instance', () => {
    configure(['golem', 'wombat', 'snail']);
    const first = renderScope();
    const second = renderScope();

    act(() => first.result.current.scope.setScope('wombat'));

    expect(first.result.current.scope.scope).toBe('wombat');
    expect(first.result.current.search).toBe('?installation=wombat');
    expect(second.result.current.scope.scope).toBe('wombat');
    expect(window.localStorage.getItem(INSTALLATION_SCOPE_STORAGE_KEY)).toBe(
      'wombat',
    );
  });

  it('goes back to all through setScope, clearing the URL parameter', () => {
    configure(['golem', 'wombat', 'snail']);
    const { result } = renderScope(
      '/agent-platform/agents?installation=wombat',
    );

    act(() => result.current.scope.setScope(ALL_INSTALLATIONS));

    expect(result.current.scope.scope).toBe(ALL_INSTALLATIONS);
    expect(result.current.search).toBe('');
    expect(
      window.localStorage.getItem(INSTALLATION_SCOPE_STORAGE_KEY),
    ).toBeNull();
  });

  it('lets the URL win while it carries the parameter', () => {
    configure(['golem', 'wombat', 'snail']);
    window.localStorage.setItem(INSTALLATION_SCOPE_STORAGE_KEY, 'wombat');

    const { result } = renderScope('/agent-platform/agents?installation=snail');

    // Nothing else has run: the deep link narrows the very first render.
    expect(result.current.scope.scope).toBe('snail');
  });

  it('restores a stored choice of another installation', () => {
    window.localStorage.setItem(INSTALLATION_SCOPE_STORAGE_KEY, 'wombat');
    configure(['golem', 'wombat', 'snail']);

    const { result } = renderScope();

    expect(result.current.scope.scope).toBe('wombat');
    // Confirmed once the config is known: no longer a mere restore.
    expect(getInstallationScopeSnapshot()).toEqual({
      scope: 'wombat',
      restored: false,
    });
  });

  it('reads a stored home installation as all -- the muster picker wrote that for everyone', () => {
    window.localStorage.setItem(INSTALLATION_SCOPE_STORAGE_KEY, 'golem');
    configure(['golem', 'wombat', 'snail']);

    const { result } = renderScope();

    expect(result.current.scope.scope).toBe(ALL_INSTALLATIONS);
    expect(getInstallationScopeSnapshot().scope).toBe(ALL_INSTALLATIONS);
    expect(
      window.localStorage.getItem(INSTALLATION_SCOPE_STORAGE_KEY),
    ).toBeNull();
  });

  it('keeps a home installation pinned deliberately in this session', () => {
    configure(['golem', 'wombat', 'snail']);
    const { result } = renderScope();

    act(() => result.current.scope.setScope('golem'));

    expect(result.current.scope.scope).toBe('golem');
    expect(result.current.search).toBe('?installation=golem');
  });

  it('does not touch a restored value before the installations config is known', () => {
    window.localStorage.setItem(INSTALLATION_SCOPE_STORAGE_KEY, 'golem');
    mockInventory = { entries: [], home: undefined, isLoading: true };

    const { result } = renderScope();

    expect(result.current.scope.isLoading).toBe(true);
    expect(result.current.scope.isSingleInstallation).toBe(false);
    expect(getInstallationScopeSnapshot()).toEqual({
      scope: 'golem',
      restored: true,
    });
  });

  it('is a single installation on a portal that knows one', () => {
    configure(['golem']);
    mockInventory = { entries: [golem], home: 'golem', isLoading: false };

    const { result } = renderScope();

    expect(result.current.scope.isSingleInstallation).toBe(true);
    expect(result.current.scope.installations.map(e => e.installation)).toEqual(
      ['golem'],
    );
  });

  describe('and the Cluster access widget', () => {
    // The widget switches installations off app-wide; the inventory marks them
    // and this hook must neither offer nor stay pinned to one.
    const switchedOffWombat = entry('wombat', {
      muted: true,
      accessState: 'unknown',
    });

    it('does not offer an installation that is switched off', () => {
      configure(['golem', 'wombat', 'snail']);
      mockMuted = ['wombat'];
      mockInventory = {
        entries: [golem, switchedOffWombat, snail],
        home: 'golem',
        isLoading: false,
      };

      const { result } = renderScope();

      expect(
        result.current.scope.installations.map(e => e.installation),
      ).toEqual(['golem']);
    });

    it('unpins a stored installation that is switched off, clearing the store', () => {
      configure(['golem', 'wombat', 'snail']);
      window.localStorage.setItem(INSTALLATION_SCOPE_STORAGE_KEY, 'wombat');
      mockMuted = ['wombat'];
      mockInventory = {
        entries: [golem, switchedOffWombat, snail],
        home: 'golem',
        isLoading: false,
      };

      const { result } = renderScope();

      // Reported as "all" on the very first render, not a commit later: the
      // selector would otherwise show the pinned name as "not found" and every
      // provider would query an installation the person switched off.
      expect(result.current.scope.scope).toBe(ALL_INSTALLATIONS);
      expect(
        window.localStorage.getItem(INSTALLATION_SCOPE_STORAGE_KEY),
      ).toBeNull();
      expect(getInstallationScopeSnapshot().scope).toBe(ALL_INSTALLATIONS);
    });

    it('unpins a deep link to an installation that is switched off, clearing the URL', () => {
      configure(['golem', 'wombat', 'snail']);
      mockMuted = ['wombat'];
      mockInventory = {
        entries: [golem, switchedOffWombat, snail],
        home: 'golem',
        isLoading: false,
      };

      const { result } = renderScope(
        '/agent-platform/agents?installation=wombat',
      );

      expect(result.current.scope.scope).toBe(ALL_INSTALLATIONS);
      expect(result.current.search).toBe('');
    });

    it('falls back to all when the pinned installation is switched off mid-session', () => {
      configure(['golem', 'wombat', 'snail']);
      const { result, rerender } = renderScope();

      act(() => result.current.scope.setScope('wombat'));
      expect(result.current.scope.scope).toBe('wombat');

      mockMuted = ['wombat'];
      mockInventory = {
        entries: [golem, switchedOffWombat, snail],
        home: 'golem',
        isLoading: false,
      };
      act(() => rerender());

      expect(result.current.scope.scope).toBe(ALL_INSTALLATIONS);
      expect(result.current.search).toBe('');
      expect(
        window.localStorage.getItem(INSTALLATION_SCOPE_STORAGE_KEY),
      ).toBeNull();
    });

    it('keeps the selector on a portal whose installations are all but one switched off', () => {
      // Switching everything off must not look like a single-installation
      // portal: the selector is the only control that says why the section is
      // narrow, so it has to stay.
      configure(['golem', 'wombat', 'snail']);
      mockMuted = ['wombat', 'snail'];
      mockInventory = {
        entries: [
          golem,
          switchedOffWombat,
          entry('snail', { muted: true, accessState: 'unknown' }),
        ],
        home: 'golem',
        isLoading: false,
      };

      const { result } = renderScope();

      expect(result.current.scope.isSingleInstallation).toBe(false);
      expect(
        result.current.scope.installations.map(e => e.installation),
      ).toEqual(['golem']);
    });
  });
});
