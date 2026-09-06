/**
 * Prefix of every inventory query key: what `refresh()` invalidates, and what
 * the QueryClientProviders this hook runs under see when they decide what to
 * persist (the agent-platform provider persists it; muster's client persists
 * nothing).
 */
export const INSTALLATION_INVENTORY_QUERY_KEY_PREFIX = [
  'gs',
  'installation-inventory',
] as const;

/**
 * A verdict changes when a component is (un)installed, not on navigation, so
 * an hour is short enough; `refresh()` and an installation turning healthy
 * again re-read it sooner.
 */
export const INSTALLATION_INVENTORY_STALE_TIME_MS = 60 * 60 * 1000;

/**
 * One installation's probe. The `v1` segment versions the data shape (a
 * `PlatformComponents` record): the cache is persisted to localStorage across
 * releases, so a new shape needs a new segment, and `isPlatformComponents`
 * guards whatever an older release left under this one.
 */
export function installationInventoryQueryKey(installation: string) {
  return ['gs', 'installation-inventory', 'v1', installation] as const;
}
