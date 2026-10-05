import { Constraints, Version } from '@giantswarm/semver-ts';

export type AutoUpgradeMode =
  'no-upgrades' | 'patch-upgrades' | 'minor-upgrades' | 'major-upgrades';

const autoUpgradeLabels: Record<AutoUpgradeMode, string> = {
  'no-upgrades': 'None',
  'patch-upgrades': 'Patch',
  'minor-upgrades': 'Minor and patch',
  'major-upgrades': 'Any',
};

type OciRepositoryRef = { semver?: string; tag?: string; digest?: string };

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
 * Whether the range admits any version at or above `from` and, when given,
 * below `below`: each of its `||` alternatives narrowed to those bounds.
 */
function admitsBetween(
  range: Constraints,
  from: string,
  below?: string,
): boolean {
  const bounds = below ? `>=${from}, <${below}` : `>=${from}`;
  const narrowed = range
    .toString()
    .split('||')
    .map(alternative => `${alternative.trim() || '*'}, ${bounds}`)
    .join(' || ');
  return Boolean(Constraints.tryParse(narrowed)?.minVersion());
}

/**
 * Derives the automatic upgrade mode of an OCIRepository reference: which
 * upgrades Flux performs from the current version, read with the constraint
 * semantics Flux uses (Masterminds/semver). As in Flux, a digest takes
 * precedence over a semver range, and a pinned tag or digest, or a range that
 * admits no newer version, means no automatic upgrades.
 *
 * @param ref - The OCIRepository `spec.ref`
 * @param currentVersion - The version Flux currently resolves the range to, if known
 */
export function deriveAutoUpgradeMode(
  ref: OciRepositoryRef | undefined,
  currentVersion?: string,
): AutoUpgradeMode {
  if (ref?.digest) return 'no-upgrades';

  const range = ref?.semver ? Constraints.tryParse(ref.semver) : null;
  const base = range ? rangeBase(range, currentVersion) : null;
  if (!range || !base) return 'no-upgrades';

  const { major, minor, patch } = base;
  const nextMajor = `${major + 1}.0.0`;
  const nextMinor = `${major}.${minor + 1}.0`;

  if (admitsBetween(range, nextMajor)) return 'major-upgrades';
  if (admitsBetween(range, nextMinor, nextMajor)) return 'minor-upgrades';
  if (admitsBetween(range, `${major}.${minor}.${patch + 1}`, nextMinor)) {
    return 'patch-upgrades';
  }
  return 'no-upgrades';
}

/**
 * Derives the chart version of an OCIRepository reference, with the precedence
 * Flux uses: for a digest the tag, if any; for a semver range the version Flux
 * currently resolves it to, else the lowest version the range admits; else the
 * tag.
 */
export function deriveChartVersion(
  ref: OciRepositoryRef | undefined,
  currentVersion?: string,
): string | undefined {
  if (ref?.digest) return ref.tag;

  const range = ref?.semver ? Constraints.tryParse(ref.semver) : null;
  if (range) return rangeBase(range, currentVersion)?.toOriginalString();

  return ref?.tag;
}

/**
 * Reads the version from an OCIRepository `status.artifact.revision`:
 * `1.2.3@sha256:…`, or `1.2.3/sha256:…` as written before Flux 2.0.
 */
export function versionFromRevision(
  revision: string | undefined,
): string | undefined {
  return revision?.split(/[@/]/)[0] || undefined;
}

export function getAutoUpgradeLabel(mode: AutoUpgradeMode): string {
  return autoUpgradeLabels[mode];
}
