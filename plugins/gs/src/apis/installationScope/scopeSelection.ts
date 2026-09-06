import type {
  InstallationInventoryEntry,
  PlatformComponent,
} from '../installationInventory/types';
import {
  ALL_INSTALLATIONS,
  type InstallationScope,
} from './installationScopeStore';

/**
 * The components whose presence makes an installation an Agent Platform
 * installation, as far as the section is concerned. CAPI is not one: every
 * management cluster runs it, so it would make every installation a platform
 * installation.
 */
export const PLATFORM_SCOPE_COMPONENTS: readonly PlatformComponent[] = [
  'kagent',
  'muster',
  'kserve',
];

/** Short names for the components, as the selector and the tabs say them. */
export const PLATFORM_COMPONENT_LABELS: Record<PlatformComponent, string> = {
  kagent: 'kagent',
  muster: 'muster',
  kserve: 'KServe',
  capi: 'Cluster API',
};

/**
 * Whether the inventory says the installation runs any Agent Platform
 * component. Only an answered probe can say so; an installation that was never
 * asked (not signed in, never healthy) is unknown, not a platform installation.
 */
export function isPlatformInstallation(
  entry: InstallationInventoryEntry,
): boolean {
  return (
    entry.probe === 'answered' &&
    PLATFORM_SCOPE_COMPONENTS.some(component => entry.components[component])
  );
}

/**
 * The installations the scope offers: every platform installation the
 * inventory knows, in inventory order (home first), plus the pinned one while
 * its own probe has not answered -- a deep link to an installation whose
 * inventory is still loading must not read as "unknown installation" for the
 * seconds until it answers.
 */
export function selectPlatformInstallations(
  entries: InstallationInventoryEntry[],
  scope: InstallationScope,
): InstallationInventoryEntry[] {
  const platform = entries.filter(isPlatformInstallation);
  if (scope === ALL_INSTALLATIONS) {
    return platform;
  }
  if (platform.some(entry => entry.installation === scope)) {
    return platform;
  }
  const pinned = entries.find(
    entry => entry.installation === scope && entry.probe === 'pending',
  );
  return pinned ? [...platform, pinned] : platform;
}

/**
 * Narrows a list of installation names to the scope: every name under
 * `'all'`, the pinned name alone otherwise (and nothing when it is not in the
 * list -- a pinned installation without the component queries nothing).
 */
export function applyInstallationScope(
  installations: string[],
  scope: InstallationScope,
): string[] {
  if (scope === ALL_INSTALLATIONS) {
    return installations;
  }
  return installations.filter(installation => installation === scope);
}

/**
 * The state suffix the selector shows for one installation, for the tab that
 * needs `component`: signed out, not reachable, or lacking the component the
 * current tab reads. `undefined` when there is nothing to say.
 */
export function describeInstallationScopeOption(
  entry: InstallationInventoryEntry,
  component?: PlatformComponent,
): string | undefined {
  if (entry.accessState === 'session-expired') {
    return 'signed out';
  }
  if (entry.accessState === 'degraded') {
    return 'not reachable';
  }
  if (entry.probe === 'pending') {
    return 'checking…';
  }
  if (component && entry.probe === 'answered' && !entry.components[component]) {
    return `no ${PLATFORM_COMPONENT_LABELS[component]} here`;
  }
  return undefined;
}
