import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import type { InstallationInventoryEntry } from '../installationInventory/types';
import { useInstallationInventory } from '../installationInventory/useInstallationInventory';
import { useInstallations } from '../installations/useInstallations';
import {
  ALL_INSTALLATIONS,
  getInstallationScopeSnapshot,
  setInstallationScope,
  subscribeInstallationScope,
  type InstallationScope,
} from './installationScopeStore';
import { selectPlatformInstallations } from './scopeSelection';

export type UseInstallationScopeResult = {
  /** `'all'`, or the name of the pinned installation. */
  scope: InstallationScope;
  /** Pins one installation, or `'all'`; persisted, and mirrored to the URL. */
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
 * Backed by the module store (`installationScopeStore`), so the agent-platform
 * providers and the muster section -- different plugins, different React
 * providers, one page -- read the same value without a shared context. The
 * URL side (`?installation=`) is kept in step by `useInstallationScopeUrlSync`,
 * which the section's selector mounts once; everything else only reads.
 *
 * Runs under whichever react-query client is in context, for the inventory.
 */
export function useInstallationScope(): UseInstallationScopeResult {
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
    setInstallationScope(
      live.scope === home ? ALL_INSTALLATIONS : live.scope,
    );
  }, [pendingRestore, home]);
  const scope = restoredHome ? ALL_INSTALLATIONS : state.scope;

  const setScope = useCallback((next: InstallationScope) => {
    setInstallationScope(next);
  }, []);

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
