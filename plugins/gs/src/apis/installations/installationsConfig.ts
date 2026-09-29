/**
 * The Giant Swarm installations, read from the signed-in config.
 *
 * `gs.installations` is backend-only in the schema: shipping it to the
 * unauthenticated frontend config would deanonymize customers (`baseDomain`)
 * and leak the installation topology. It reaches the browser as part of the
 * signed-in config (`GET /api/gs/config`, published by `SignedInConfigLoader`
 * after the main sign-in), and this module is the typed view of that part:
 * the boot-time APIs (`DiscoveryApiClient`, `KubernetesClient`,
 * `GSAuthProviders`) await it lazily on paths that run after sign-in, React
 * consumers subscribe through `useInstallations`.
 */
import { Config, ConfigReader } from '@backstage/config';
import {
  __resetSignedInConfigForTests,
  getSignedInConfig,
  getSignedInConfigSnapshot,
  setSignedInConfig,
  subscribeSignedInConfig,
} from '@giantswarm/backstage-plugin-gs-react';

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
  /**
   * Whether the installation runs the Giant Swarm observability stack (Mimir
   * at `observability.<baseDomain>`). Defaults to true; standalone
   * installations set false to opt out of metrics-backed features.
   */
  mimirEnabled?: boolean;
  apiVersionOverrides?: { [pluralKind: string]: string };
};

/** `gs.installations` as configured: keyed by installation name. */
type InstallationsMap = {
  [installationName: string]: Omit<InstallationConfig, 'name'>;
};

// One array per config instance, so snapshots stay referentially stable for
// `useSyncExternalStore` and the per-request callers.
const byConfig = new WeakMap<Config, InstallationConfig[]>();

/**
 * The installations of a signed-in config as a stable, name-carrying array.
 * Missing `gs.installations` reads as no installations.
 */
export function readInstallationsConfig(config: Config): InstallationConfig[] {
  let installations = byConfig.get(config);
  if (!installations) {
    const map = config.getOptional<InstallationsMap>('gs.installations') ?? {};
    installations = Object.entries(map).map(([name, value]) => ({
      name,
      ...value,
    }));
    byConfig.set(config, installations);
  }
  return installations;
}

/**
 * Resolves with the installations once the signed-in config has loaded. If
 * already loaded, resolves immediately. Used by boot-time APIs that only touch
 * installations after the main sign-in.
 */
export function getInstallationsConfig(): Promise<InstallationConfig[]> {
  return getSignedInConfig().then(readInstallationsConfig);
}

/**
 * Synchronous snapshot of the installations, or `undefined` while the
 * signed-in config has not loaded. Used by `useSyncExternalStore` and by sync
 * code paths that must not block (they treat `undefined` as "not loaded yet").
 */
export function getInstallationsConfigSnapshot():
  InstallationConfig[] | undefined {
  const config = getSignedInConfigSnapshot();
  return config ? readInstallationsConfig(config) : undefined;
}

/** Subscribes to signed-in config publishes. Returns the unsubscribe function. */
export const subscribeInstallationsConfig = subscribeSignedInConfig;

/**
 * Publishes a signed-in config that carries exactly these installations. For
 * tests; the app publishes the whole config through `SignedInConfigLoader`.
 */
export function setInstallationsConfig(
  installations: InstallationConfig[],
): void {
  const map: InstallationsMap = {};
  for (const { name, ...rest } of installations) {
    map[name] = rest;
  }
  setSignedInConfig(new ConfigReader({ gs: { installations: map } }));
}

/** Test-only: clears the signed-in config between tests. */
export const __resetInstallationsConfigForTests = __resetSignedInConfigForTests;
