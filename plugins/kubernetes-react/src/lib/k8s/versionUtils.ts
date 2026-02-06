import { VersionCompatibility } from './VersionTypes';

/**
 * Parses a Kubernetes API version string into comparable parts.
 * Supports formats like: v1, v1beta1, v1alpha1, v2beta2
 *
 * @param version - Version string (e.g., "v1beta1")
 * @returns Object with major version, stability level, and minor version
 */
export function parseVersion(version: string): {
  major: number;
  stability: 'stable' | 'beta' | 'alpha';
  minor: number;
} {
  // Match patterns like v1, v1beta1, v1alpha2
  const match = version.match(/^v(\d+)(alpha|beta)?(\d+)?$/i);

  if (!match) {
    // Return lowest priority for unparseable versions
    return { major: 0, stability: 'alpha', minor: 0 };
  }

  const major = parseInt(match[1], 10);
  const stabilityStr = match[2]?.toLowerCase();
  const minor = match[3] ? parseInt(match[3], 10) : 0;

  let stability: 'stable' | 'beta' | 'alpha' = 'stable';
  if (stabilityStr === 'alpha') {
    stability = 'alpha';
  } else if (stabilityStr === 'beta') {
    stability = 'beta';
  }

  return { major, stability, minor };
}

/**
 * Compares two Kubernetes API versions.
 * Ordering: v1alpha1 < v1beta1 < v1 < v2alpha1 < v2beta1 < v2
 *
 * @param a - First version string
 * @param b - Second version string
 * @returns Negative if a < b, positive if a > b, zero if equal
 */
export function compareVersions(a: string, b: string): number {
  const parsedA = parseVersion(a);
  const parsedB = parseVersion(b);

  // Compare major version first
  if (parsedA.major !== parsedB.major) {
    return parsedA.major - parsedB.major;
  }

  // Map stability to numeric value for comparison
  const stabilityOrder = { alpha: 0, beta: 1, stable: 2 };
  const stabilityA = stabilityOrder[parsedA.stability];
  const stabilityB = stabilityOrder[parsedB.stability];

  if (stabilityA !== stabilityB) {
    return stabilityA - stabilityB;
  }

  // Compare minor version (e.g., beta1 vs beta2)
  return parsedA.minor - parsedB.minor;
}

/**
 * Sorts version strings from oldest to newest.
 *
 * @param versions - Array of version strings
 * @returns New sorted array (oldest first, newest last)
 */
export function sortVersions(versions: readonly string[]): string[] {
  return [...versions].sort(compareVersions);
}

/**
 * Gets the latest (newest) version from an array of versions.
 *
 * @param versions - Array of version strings
 * @returns The latest version, or undefined if array is empty
 */
export function getLatestVersion(
  versions: readonly string[],
): string | undefined {
  if (versions.length === 0) {
    return undefined;
  }

  const sorted = sortVersions(versions);
  return sorted[sorted.length - 1];
}

/**
 * Checks version compatibility between client (resource class) and server versions.
 * Prefers the server's preferred version if compatible, otherwise falls back to the
 * latest compatible version.
 *
 * @param clientVersions - Versions supported by the client (resource class)
 * @param serverVersions - Versions available on the server (from API discovery)
 * @param serverPreferredVersion - The server's preferred version (from API group discovery)
 * @returns Compatibility result with resolved version
 */
export function checkVersionCompatibility(
  clientVersions: readonly string[],
  serverVersions: string[],
  serverPreferredVersion?: string,
): VersionCompatibility {
  // Find intersection of client and server versions
  const clientSet = new Set(clientVersions);
  const compatibleVersions = serverVersions.filter(v => clientSet.has(v));

  // Sort compatible versions
  const sortedCompatible = sortVersions(compatibleVersions);

  // Prefer the server's preferred version if it's compatible,
  // otherwise fall back to the latest compatible version.
  // This is important because different resources in the same API group
  // may support different versions (e.g., OCIRepository might only support v1beta2
  // even if the group advertises v1 for other resources like GitRepository).
  let resolvedVersion: string | undefined;
  if (
    serverPreferredVersion &&
    compatibleVersions.includes(serverPreferredVersion)
  ) {
    resolvedVersion = serverPreferredVersion;
  } else if (sortedCompatible.length > 0) {
    resolvedVersion = sortedCompatible[sortedCompatible.length - 1];
  }

  // Determine if client is outdated (server has newer versions than client supports)
  const clientLatest = getLatestVersion(clientVersions);
  const serverLatest = getLatestVersion(serverVersions);
  const isClientOutdated =
    clientLatest !== undefined &&
    serverLatest !== undefined &&
    compareVersions(serverLatest, clientLatest) > 0;

  return {
    isCompatible: sortedCompatible.length > 0,
    resolvedVersion,
    compatibleVersions: sortedCompatible,
    clientVersions,
    serverVersions,
    isClientOutdated,
  };
}
