/**
 * Module-level store for the Agent Platform section's installation scope.
 *
 * The scope is one value for the whole section: `'all'` (every platform
 * installation, the home installation first) or the name of one installation
 * the person pinned. The agent-platform tabs and the muster section (mounted
 * as a tab of the same page, but a different plugin with its own React
 * providers) must read the same value, so it lives here rather than in a React
 * context: `useSyncExternalStore` on both sides, no provider to share across
 * the plugin boundary -- the same shape as the installations config source.
 *
 * Persistence: the pinned installation is mirrored to localStorage under the
 * key the muster picker has always used, so a choice made before the section
 * shared one scope is honoured; `'all'` removes the key. The URL
 * (`?installation=`) is synced by `useInstallationScopeUrlSync`, mounted once
 * by the section's selector.
 */

/** The localStorage key: the one the muster picker persisted its choice under. */
export const INSTALLATION_SCOPE_STORAGE_KEY = 'muster-installation';

/** The search parameter deep links carry; absent means every installation. */
export const INSTALLATION_SCOPE_SEARCH_PARAM = 'installation';

export const ALL_INSTALLATIONS = 'all' as const;

/** `'all'`, or the name of the pinned installation. */
export type InstallationScope = string | typeof ALL_INSTALLATIONS;

export type InstallationScopeState = {
  scope: InstallationScope;
  /**
   * True while `scope` is what localStorage held when the store initialised
   * and nobody has set it since. The muster picker used to write its *default*
   * (the home installation) there for everyone who opened the MCP Servers
   * tab, so a restored value equal to the home installation is read as
   * `'all'` -- see `useInstallationScope` -- rather than pinning every
   * existing person to one installation on their first visit.
   */
  restored: boolean;
};

let state: InstallationScopeState | undefined;
const listeners = new Set<() => void>();

function storage(): Storage | undefined {
  try {
    return typeof window !== 'undefined' ? window.localStorage : undefined;
  } catch {
    // Access itself can throw (a browser set to block site data).
    return undefined;
  }
}

/** The scope localStorage holds: a name, or `'all'` when nothing is stored. */
export function readStoredInstallationScope(): InstallationScope {
  try {
    const stored = storage()?.getItem(INSTALLATION_SCOPE_STORAGE_KEY);
    return stored ? stored : ALL_INSTALLATIONS;
  } catch {
    return ALL_INSTALLATIONS;
  }
}

function writeStoredInstallationScope(scope: InstallationScope): void {
  try {
    if (scope === ALL_INSTALLATIONS) {
      storage()?.removeItem(INSTALLATION_SCOPE_STORAGE_KEY);
    } else {
      storage()?.setItem(INSTALLATION_SCOPE_STORAGE_KEY, scope);
    }
  } catch {
    // localStorage may be unavailable (private mode); the in-memory store
    // and the URL still carry the scope.
  }
}

function ensureState(): InstallationScopeState {
  if (!state) {
    state = { scope: readStoredInstallationScope(), restored: true };
  }
  return state;
}

/** Synchronous snapshot for `useSyncExternalStore`; stable between changes. */
export function getInstallationScopeSnapshot(): InstallationScopeState {
  return ensureState();
}

export function subscribeInstallationScope(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Pins one installation, or `'all'`. Mirrors the choice to localStorage and
 * wakes every subscriber. A no-op when nothing changes, so the two sides that
 * may both call it for the same value (the URL sync and a picker) never
 * ping-pong.
 */
export function setInstallationScope(next: InstallationScope): void {
  const current = ensureState();
  if (current.scope === next && !current.restored) {
    return;
  }
  state = { scope: next, restored: false };
  writeStoredInstallationScope(next);
  listeners.forEach(listener => listener());
}

/** Test-only: forgets the in-memory state (not localStorage). */
export function __resetInstallationScopeForTests(): void {
  state = undefined;
  listeners.clear();
}
