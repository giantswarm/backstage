import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { InstallationInventoryEntry } from '../installationInventory/types';
import { useInstallationInventory } from '../installationInventory/useInstallationInventory';
import { useInstallations } from '../installations/useInstallations';
import {
  ALL_INSTALLATIONS,
  getInstallationScopeSnapshot,
  INSTALLATION_SCOPE_SEARCH_PARAM,
  setInstallationScope,
  subscribeInstallationScope,
  type InstallationScope,
} from './installationScopeStore';
import { selectPlatformInstallations } from './scopeSelection';

export type UseInstallationScopeResult = {
  /** `'all'`, or the name of the pinned installation. */
  scope: InstallationScope;
  /** Pins one installation, or `'all'`: store, localStorage and URL at once. */
  setScope: (next: InstallationScope) => void;
  /**
   * The platform installations the selector offers, home first: every
   * installation whose inventory has kagent, muster or KServe, with its
   * access and probe state (`selectPlatformInstallations`).
   */
  installations: InstallationInventoryEntry[];
  /** The home installation's name, once the installations config is known. */
  home: string | undefined;
  /**
   * The portal knows one installation (or none): no selector and no groups
   * are rendered, and the section behaves as it did before it had a scope.
   * False while the installations config is still loading.
   */
  isSingleInstallation: boolean;
  /** True until the installations config has loaded. */
  isLoading: boolean;
};

/**
 * The Agent Platform section's one installation scope, for every tab.
 *
 * Two sources, one answer: `?installation=` in the URL wins while it is
 * present (a deep link narrows the very first render, before anything else
 * has run), otherwise the module store (`installationScopeStore`) -- what the
 * person pinned, kept across tab links that carry no query string and, via
 * localStorage, across visits. The store is what the agent-platform providers
 * and the muster section -- different plugins, different React providers, one
 * page -- share without a common context. `useInstallationScopeUrlSync`,
 * mounted once by the section's selector, keeps the two sources in step.
 *
 * Runs under whichever react-query client is in context, for the inventory.
 */
export function useInstallationScope(): UseInstallationScopeResult {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlScope = searchParams.get(INSTALLATION_SCOPE_SEARCH_PARAM);
  const state = useSyncExternalStore(
    subscribeInstallationScope,
    getInstallationScopeSnapshot,
    getInstallationScopeSnapshot,
  );
  const { isLoading } = useInstallations();
  const inventory = useInstallationInventory();
  const { home, entries } = inventory;

  // A value restored from localStorage is confirmed once the installations
  // config is known -- unless it names the home installation: that is the
  // muster picker's old default, written for everyone who ever opened the MCP
  // Servers tab, not a choice. It reads as "all" and is forgotten. A home
  // pinned deliberately in this session is `restored: false` and stays pinned.
  const pendingRestore = state.restored && !isLoading;
  const restoredHome = pendingRestore && state.scope === home;
  useEffect(() => {
    if (!pendingRestore) {
      return;
    }
    // Re-read: another effect of the same commit (the URL sync adopting a deep
    // link) may already have set the store, and must not be overwritten.
    const live = getInstallationScopeSnapshot();
    if (!live.restored) {
      return;
    }
    setInstallationScope(live.scope === home ? ALL_INSTALLATIONS : live.scope);
  }, [pendingRestore, home]);
  const storedScope = restoredHome ? ALL_INSTALLATIONS : state.scope;
  const scope = urlScope ?? storedScope;

  // One call, three places: the store (every consumer, at once), localStorage
  // (the next visit) and the URL (this page's deep link). Written here rather
  // than left to the sync hook so the URL never lags a pin -- and so choosing
  // "all" clears a `?installation=` the URL still carries, which the sync hook
  // would otherwise read as a deep link and adopt right back.
  const setScope = useCallback(
    (next: InstallationScope) => {
      setInstallationScope(next);
      setSearchParams(
        previous => {
          const params = new URLSearchParams(previous);
          if (next === ALL_INSTALLATIONS) {
            params.delete(INSTALLATION_SCOPE_SEARCH_PARAM);
          } else {
            params.set(INSTALLATION_SCOPE_SEARCH_PARAM, next);
          }
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const installations = useMemo(
    () => selectPlatformInstallations(entries, scope),
    [entries, scope],
  );

  // One entry in the inventory means one configured installation: the
  // standalone chart, a customer portal. Decided on the configured list, not
  // on how many run the platform, so the selector does not appear and vanish
  // as probes answer.
  const isSingleInstallation = !isLoading && entries.length <= 1;

  return useMemo(
    () => ({
      scope,
      setScope,
      installations,
      home,
      isSingleInstallation,
      isLoading,
    }),
    [scope, setScope, installations, home, isSingleInstallation, isLoading],
  );
}
