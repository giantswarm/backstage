import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { InstallationInventoryEntry } from '../installationInventory/types';
import { useInstallationInventory } from '../installationInventory/useInstallationInventory';
import { useInstallations } from '../installations/useInstallations';
import { useMutedInstallations } from '../mutedInstallations';
import {
  ALL_INSTALLATIONS,
  getInstallationScopeSnapshot,
  INSTALLATION_SCOPE_SEARCH_PARAM,
  setInstallationScope,
  subscribeInstallationScope,
  type InstallationScope,
} from './installationScopeStore';
import { selectPlatformInstallations } from './scopeSelection';
import { useWriteScopeParam } from './useWriteScopeParam';

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
 * localStorage, across visits. Either way, a pin naming an installation
 * switched off in the sidebar Cluster access widget reads as `'all'` and is
 * forgotten, since the selector no longer offers it; so does a pin restored
 * from localStorage naming an installation the portal does not know at all,
 * and on a single-installation portal (no selector to get out with) any
 * unknown pin. The store is what the
 * agent-platform providers and the muster section -- different plugins,
 * different React providers, one page -- share without a common context.
 * `useInstallationScopeUrlSync`, mounted once by the section's selector, keeps
 * the two sources in step.
 *
 * Runs under whichever react-query client is in context, for the inventory.
 */
export function useInstallationScope(): UseInstallationScopeResult {
  const [searchParams] = useSearchParams();
  const writeScopeParam = useWriteScopeParam();
  const urlScope = searchParams.get(INSTALLATION_SCOPE_SEARCH_PARAM);
  const state = useSyncExternalStore(
    subscribeInstallationScope,
    getInstallationScopeSnapshot,
    getInstallationScopeSnapshot,
  );
  const { isLoading } = useInstallations();
  const inventory = useInstallationInventory();
  const { home, entries } = inventory;
  const muted = useMutedInstallations();
  const mutedSet = useMemo(() => new Set(muted), [muted]);

  // Whether the portal's config lists an installation by this name at all.
  // Keyed on the names so the effect below re-runs only when they change.
  const knownKey = entries.map(entry => entry.installation).join('\n');
  const isKnown = useMemo(() => {
    const known = new Set(knownKey.split('\n'));
    return (name: string) => known.has(name);
  }, [knownKey]);

  // One entry in the inventory means one configured installation: the
  // standalone chart, a customer portal. Decided on the configured list, not
  // on how many run the platform, so the selector does not appear and vanish
  // as probes answer.
  const isSingleInstallation = !isLoading && entries.length <= 1;

  // A value restored from localStorage is confirmed once the installations
  // config is known -- unless it is stale, which reads as "all" and is
  // forgotten (localStorage cleared):
  // - it names the home installation: that is the muster picker's old
  //   default, written for everyone who ever opened the MCP Servers tab, not
  //   a choice. A home pinned deliberately in this session is
  //   `restored: false` and stays pinned.
  // - it names an installation this portal's config does not list at all (a
  //   lab renamed, a portal re-pointed, an old deep link's pin): it resolves
  //   to nothing, so every tab would read "knows no installation named …" and
  //   query nothing -- with no selector to get out on a single-installation
  //   portal. Falling back to "all" there means *the* installation.
  const pendingRestore = state.restored && !isLoading;
  const isStaleRestore = useCallback(
    (restored: InstallationScope) =>
      restored !== ALL_INSTALLATIONS &&
      (restored === home || !isKnown(restored)),
    [home, isKnown],
  );
  const restoredStale = pendingRestore && isStaleRestore(state.scope);
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
      isStaleRestore(live.scope) ? ALL_INSTALLATIONS : live.scope,
    );
  }, [pendingRestore, isStaleRestore]);
  const storedScope = restoredStale ? ALL_INSTALLATIONS : state.scope;
  const pinned = urlScope ?? storedScope;

  // Masked here rather than left to the effect below, which lands a commit
  // later: for that commit the pin would still be the section's scope.
  const isMutedPin = pinned !== ALL_INSTALLATIONS && mutedSet.has(pinned);

  // An unknown name pinned *in this session* -- a deep link
  // (`?installation=`), or the store the URL sync filled from one -- is kept
  // on a portal with a selector: the section's note says "knows no
  // installation named …", the selector offers it as "not found" and is the
  // way out, and quietly widening a link to every installation would show
  // other installations' data under it. A single-installation portal renders
  // no selector, so there it falls back to the one installation instead.
  const isUnknownPin =
    isSingleInstallation && pinned !== ALL_INSTALLATIONS && !isKnown(pinned);
  const scope = isMutedPin || isUnknownPin ? ALL_INSTALLATIONS : pinned;

  // One call, three places: the store (every consumer, at once), localStorage
  // (the next visit) and the URL (this page's deep link). Written here rather
  // than left to the sync hook so the URL never lags a pin -- and so choosing
  // "all" clears a `?installation=` the URL still carries, which the sync hook
  // would otherwise read as a deep link and adopt right back.
  const setScope = useCallback(
    (next: InstallationScope) => {
      setInstallationScope(next);
      writeScopeParam(next);
    },
    [writeScopeParam],
  );

  // Forget the pin for real -- store, localStorage and the URL alike -- so a
  // reload and the next visit agree with what is already rendered. Several
  // consumers of the same page run this hook, so this may fire more than once
  // for one pin; the repeats are no-ops, and the next render clears the flag.
  useEffect(() => {
    if (!isMutedPin && !isUnknownPin) {
      return;
    }
    setScope(ALL_INSTALLATIONS);
  }, [isMutedPin, isUnknownPin, setScope]);

  const installations = useMemo(
    () => selectPlatformInstallations(entries, scope),
    [entries, scope],
  );

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
