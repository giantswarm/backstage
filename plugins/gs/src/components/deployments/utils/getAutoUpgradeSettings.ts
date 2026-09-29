import { Constraints, Version } from '@giantswarm/semver-ts';

export type AutoUpgradeMode =
  'no-upgrades' | 'patch-upgrades' | 'minor-upgrades' | 'major-upgrades';

const autoUpgradeLabels: Record<AutoUpgradeMode, string> = {
  'no-upgrades': 'None',
  'patch-upgrades': 'Patch',
  'minor-upgrades': 'Minor and patch',
  'major-upgrades': 'Any',
};

/**
 * The version a semver range starts from: the version Flux currently resolves
 * it to, when that is known and inside the range, else the lowest version the
 * range admits.
 */
function rangeBase(range: Constraints, currentVersion?: string) {
  const current = currentVersion ? Version.tryParse(currentVersion) : null;
  return current && range.check(current) ? current : range.minVersion();
}

/**
 * Derives the automatic upgrade mode of an OCIRepository reference: which
 * upgrades Flux performs from the current version, read with the constraint
 * semantics Flux uses (Masterminds/semver). A pinned tag, or a range that
 * admits no newer version, means no automatic upgrades.
 *
 * @param ref - The OCIRepository `spec.ref`
 * @param currentVersion - The version Flux currently resolves the range to, if known
 */
export function deriveAutoUpgradeMode(
  ref: { semver?: string; tag?: string } | undefined,
  currentVersion?: string,
): AutoUpgradeMode {
  const range = ref?.semver ? Constraints.tryParse(ref.semver) : null;
  const base = range ? rangeBase(range, currentVersion) : null;
  if (!range || !base) return 'no-upgrades';

  const { major, minor, patch } = base;
  const admits = (...parts: [number, number, number]) =>
    range.check(new Version(...parts, '', '', ''));

  if (admits(major + 1, 0, 0)) return 'major-upgrades';
  if (admits(major, minor + 1, 0)) return 'minor-upgrades';
  if (admits(major, minor, patch + 1)) return 'patch-upgrades';
  return 'no-upgrades';
}

/**
 * Derives the chart version of an OCIRepository reference: the pinned tag, or
 * for a semver range the version Flux currently resolves it to, else the
 * lowest version the range admits. A range without a lower bound (`*`,
 * `<2.0.0`) yields no version unless the current one is known.
 */
export function deriveChartVersion(
  ref: { semver?: string; tag?: string } | undefined,
  currentVersion?: string,
): string | undefined {
  if (ref?.tag) return ref.tag;

  const range = ref?.semver ? Constraints.tryParse(ref.semver) : null;
  if (!range) return undefined;

  const current = currentVersion ? Version.tryParse(currentVersion) : null;
  if (current && range.check(current)) return currentVersion;

  const min = range.minVersion();
  return min && (min.major || min.minor || min.patch)
    ? min.toString()
    : undefined;
}

/** Reads the version from an OCIRepository `status.artifact.revision` such as `1.2.3@sha256:…`. */
export function versionFromRevision(
  revision: string | undefined,
): string | undefined {
  return revision?.split('@')[0] || undefined;
}

export function getAutoUpgradeLabel(mode: AutoUpgradeMode): string {
  return autoUpgradeLabels[mode];
}
