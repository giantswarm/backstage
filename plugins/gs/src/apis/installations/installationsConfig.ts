/**
 * Module-level async source for the Giant Swarm installations configuration.
 *
 * The `gs.installations` block is no longer shipped to the (unauthenticated)
 * frontend config -- it deanonymizes customers and leaks the installation
 * topology. Instead the SPA fetches it from the authenticated
 * `GET /api/gs/installations` endpoint once, after the user signs in (see
 * `InstallationsConfigLoader`).
 *
 * Backstage Utility API factories are constructed before React renders, so
 * React context alone cannot feed them. This module is that bridge: the boot
 * -time APIs (`DiscoveryApiClient`, `KubernetesClient`, `GSAuthProviders`)
 * `await getInstallationsConfig()` lazily -- none of them need installations
 * before the main Dex sign-in completes -- while React consumers subscribe via
 * `useSyncExternalStore` and re-render once the data arrives.
 */

export type InstallationConfig = {
  name: string;
  pipeline?: string;
  providers?: string[];
  authProvider?: string;
  oidcTokenProvider?: string;
  clusterTokenAudience?: string;
  backendUrl?: string;
  baseDomain?: string;
  region?: string;
  apiVersionOverrides?: { [pluralKind: string]: string };
};

/** Raw shape returned by the backend endpoint (keyed by installation name). */
export type InstallationsConfigResponse = {
  [installationName: string]: Omit<InstallationConfig, 'name'>;
};

let installations: InstallationConfig[] | undefined;
let deferred:
  | {
      promise: Promise<InstallationConfig[]>;
      resolve: (v: InstallationConfig[]) => void;
    }
  | undefined;
const listeners = new Set<() => void>();

function ensureDeferred() {
  if (!deferred) {
    let resolve!: (v: InstallationConfig[]) => void;
    const promise = new Promise<InstallationConfig[]>(res => {
      resolve = res;
    });
    deferred = { promise, resolve };
  }
  return deferred;
}

/** Normalizes the backend response into a stable, name-carrying array. */
export function normalizeInstallationsConfig(
  response: InstallationsConfigResponse,
): InstallationConfig[] {
  return Object.entries(response).map(([name, value]) => ({ name, ...value }));
}

/**
 * Populates the source and wakes every awaiting API + subscribed component.
 * Idempotent: calling it again (e.g. a re-fetch) replaces the value and
 * notifies subscribers.
 */
export function setInstallationsConfig(next: InstallationConfig[]): void {
  installations = next;
  ensureDeferred().resolve(next);
  listeners.forEach(listener => listener());
}

/**
 * Resolves with the installations once loaded. If already loaded, resolves
 * immediately; otherwise waits for the post-sign-in fetch. Used by boot-time
 * APIs that only touch installations after the main sign-in.
 */
export function getInstallationsConfig(): Promise<InstallationConfig[]> {
  if (installations) {
    return Promise.resolve(installations);
  }
  return ensureDeferred().promise;
}

/**
 * Synchronous snapshot of the installations, or `undefined` when not yet
 * loaded. Used by `useSyncExternalStore` and by sync code paths that must not
 * block (they treat `undefined` as "not loaded yet").
 */
export function getInstallationsConfigSnapshot():
  InstallationConfig[] | undefined {
  return installations;
}

/** Subscribe to load/refresh notifications. Returns an unsubscribe fn. */
export function subscribeInstallationsConfig(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test-only: clears the module state between tests. */
export function __resetInstallationsConfigForTests(): void {
  installations = undefined;
  deferred = undefined;
  listeners.clear();
}
