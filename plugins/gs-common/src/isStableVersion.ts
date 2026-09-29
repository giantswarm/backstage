import { Version } from '@giantswarm/semver-ts';

/**
 * Tells whether a tag is a stable release: a semantic version without a
 * pre-release part, parsed the way Flux does (Masterminds/semver). Release
 * candidates, dev builds and tags that are no version at all are not stable.
 */
export function isStableVersion(tag: string): boolean {
  return Version.tryParse(tag)?.prerelease === '';
}
