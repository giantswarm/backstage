/**
 * Module-level source of the configuration the signed-in frontend reads.
 *
 * The unauthenticated `index.html` carries only the config the sign-in page
 * needs (`@visibility frontend`). Everything else a Giant Swarm plugin reads
 * in the browser -- the installations map, admin groups, link templates, the
 * muster and MCP server lists, ... -- is backend-only in the schema and comes
 * from the authenticated `GET /api/gs/config` once, after the main sign-in
 * (the gs plugin's `SignedInConfigLoader`). It arrives in app-config shape, so
 * consumers read it with the same `Config` API as `configApi`.
 *
 * Backstage utility API factories are constructed before React renders, so
 * React context alone cannot feed them. This module is that bridge: the
 * boot-time APIs `await getSignedInConfig()` lazily on paths that only run
 * after sign-in, while React consumers subscribe through
 * `useSyncExternalStore` (`useSignedInConfig`) and re-render once the config
 * arrives.
 */
import { Config } from '@backstage/config';

let current: Config | undefined;
let deferred:
  | {
      promise: Promise<Config>;
      resolve: (config: Config) => void;
    }
  | undefined;
const listeners = new Set<() => void>();

function ensureDeferred() {
  if (!deferred) {
    let resolve!: (config: Config) => void;
    const promise = new Promise<Config>(res => {
      resolve = res;
    });
    deferred = { promise, resolve };
  }
  return deferred;
}

/**
 * Publishes the signed-in config and wakes every awaiting API and subscribed
 * component. Idempotent: publishing again replaces the value and notifies
 * subscribers.
 */
export function setSignedInConfig(config: Config): void {
  current = config;
  ensureDeferred().resolve(config);
  listeners.forEach(listener => listener());
}

/**
 * Resolves with the signed-in config once loaded: immediately when it already
 * is, otherwise when the post-sign-in fetch publishes it. For boot-time APIs
 * that read config only after the main sign-in; never await it on a path the
 * sign-in itself depends on, since the fetch runs after sign-in.
 */
export function getSignedInConfig(): Promise<Config> {
  if (current) {
    return Promise.resolve(current);
  }
  return ensureDeferred().promise;
}

/**
 * Synchronous snapshot, or `undefined` while the config has not loaded. For
 * `useSyncExternalStore` and sync code paths that must not block (they treat
 * `undefined` as "not loaded yet").
 */
export function getSignedInConfigSnapshot(): Config | undefined {
  return current;
}

/** Subscribes to publish notifications. Returns the unsubscribe function. */
export function subscribeSignedInConfig(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test-only: clears the module state between tests. */
export function __resetSignedInConfigForTests(): void {
  current = undefined;
  deferred = undefined;
  listeners.clear();
}
