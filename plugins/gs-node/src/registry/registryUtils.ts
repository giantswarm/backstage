import { Version } from '@giantswarm/semver-ts';
import { isStableVersion } from '@giantswarm/backstage-plugin-gs-common';

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
 * Upper bound on the pages a tag listing follows, so a registry that keeps
 * answering with a next page cannot keep a request busy forever.
 */
export const MAX_TAG_PAGES = 20;

/**
 * Returns the absolute URL of the next page of a paginated registry listing,
 * read from the response's `Link: <...>; rel="next"` header, as sent by the
 * OCI Distribution Spec tag listing and by ACR's `_tags` API.
 *
 * @param response - The response of the current page
 * @param currentUrl - The URL the current page was fetched from, to resolve a relative link against
 * @returns The next page's URL, or undefined on the last page
 */
export function getNextPageUrl(
  response: { headers: { get(name: string): string | null } },
  currentUrl: string,
): string | undefined {
  const link = response.headers.get('link');
  if (!link) {
    return undefined;
  }

  for (const part of link.split(',')) {
    const match = part.match(/<([^>]+)>\s*;(.*)/);
    if (match && /\brel="?next"?/.test(match[2])) {
      return new URL(match[1], currentUrl).toString();
    }
  }
  return undefined;
}

/**
 * Sorts versions in descending order (newest first), parsing and comparing
 * them the way Flux does (Masterminds/semver). Entries that are no version at
 * all are dropped. Returns a new array without mutating the input.
 *
 * @param versions - Array of version strings
 * @returns The versions among them, sorted newest first
 */
export function sortVersions(versions: readonly string[]): string[] {
  return versions
    .map(raw => ({ raw, version: Version.tryParse(raw) }))
    .filter(
      (entry): entry is { raw: string; version: Version } =>
        entry.version !== null,
    )
    .sort((a, b) => b.version.compare(a.version))
    .map(entry => entry.raw);
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
  return sortedVersions.find(isStableVersion) ?? sortedVersions[0] ?? null;
}
