import semver from 'semver';

/**
 * Normalizes the registry URL by removing protocol prefix if present.
 *
 * @param registry - The registry URL (e.g., https://ghcr.io or ghcr.io)
 * @returns The normalized registry host (e.g., ghcr.io)
 */
export function normalizeRegistry(registry: string): string {
  return registry.replace(/^https?:\/\//, '');
}

/**
 * Sorts versions in descending order (newest first) using semver.
 * Returns a new array without mutating the input.
 *
 * @param versions - Array of semver version strings
 * @returns Sorted array of versions (newest first)
 */
export function sortVersions(versions: string[]): string[] {
  return [...versions].sort((a, b) => semver.rcompare(a, b));
}

/**
 * Finds the latest stable version (non-prerelease) from a sorted list of versions.
 *
 * @param sortedVersions - Array of semver versions sorted by version (newest first)
 * @returns The latest stable version, or the first version if no stable version exists, or null if empty
 */
export function findLatestStableVersion(
  sortedVersions: string[],
): string | null {
  for (const version of sortedVersions) {
    const parsed = semver.parse(version);
    if (parsed && parsed.prerelease.length === 0) {
      return version;
    }
  }
  return sortedVersions[0] ?? null;
}

