import { Constraints, Version } from '@giantswarm/semver-ts';

export type AutoUpgradeMode =
  'no-upgrades' | 'patch-upgrades' | 'minor-upgrades' | 'major-upgrades';

const autoUpgradeLabels: Record<AutoUpgradeMode, string> = {
  'no-upgrades': 'None',
  'patch-upgrades': 'Patch',
  'minor-upgrades': 'Minor and patch',
  'major-upgrades': 'Any',
};

type OciRepositoryRef = {
  semver?: string;
  semverFilter?: string;
  tag?: string;
  digest?: string;
};

/**
 * The release stages of the `semverFilter` values the SemVer automatic
 * upgrades guide documents (from the semver-based-automatic-upgrades RFC,
 * https://github.com/giantswarm/rfc/tree/main/semver-based-automatic-upgrades),
 * by the filter's exact text: a filter written differently is shown as its
 * regular expression. Each stage takes pre-release tags, so the range must
 * admit pre-releases for Flux to find one.
 */
const releaseStages = new Map<string, string>([
  ['^.*-r[0-9a-f]{8}t[0-9]{14}h[0-9a-f]{7}$', 'Dev builds only'],
  ['.*-rc\\..*', 'Release candidates only'],
  ['^[0-9]+\\.[0-9]+\\.[0-9]+(-rc\\.[0-9]+)?$', 'Release candidates or stable'],
]);

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

/**
 * The tag filter Flux applies before the semver range, if any: the
 * OCIRepository `spec.ref.semverFilter`. Flux reads it only along with a
 * semver range, and a digest takes precedence over both.
 */
function deriveSemverFilter(
  ref: OciRepositoryRef | undefined,
): string | undefined {
  if (ref?.digest || !ref?.semver) return undefined;
  return ref.semverFilter || undefined;
}

/**
 * Whether the semver range admits pre-release versions. Flux follows
 * Masterminds/semver, which matches a pre-release only for a range with a
 * pre-release comparator, such as `>=0.0.0-0`.
 */
function rangeIncludesPrereleases(ref: OciRepositoryRef | undefined): boolean {
  if (ref?.digest || !ref?.semver) return false;
  return /\d-[0-9A-Za-z]/.test(ref.semver);
}

const rangeOperators: Partial<Record<AutoUpgradeMode, string>> = {
  'patch-upgrades': '~',
  'minor-upgrades': '^',
  'major-upgrades': '>=',
};

/**
 * The semver range, when the edit template's fixed modes cannot write it back.
 * They write the mode's operator (`~`, `^` or `>=`) followed by the chart
 * version, with a `-0` floor when pre-releases are included: for a single
 * comparator with that operator the floor moves to the current version, which
 * leaves the upgrades Flux performs unchanged. Any other range, such as one
 * with an upper bound (`>=1.0.0 <3.0.0`), goes to the template's custom range
 * mode verbatim.
 */
function deriveCustomRange(
  ref: OciRepositoryRef | undefined,
  mode: AutoUpgradeMode,
): string | undefined {
  if (ref?.digest || !ref?.semver) return undefined;

  const range = ref.semver.trim();
  const operator = /^(~|\^|>=)\s*v?\d[^\s,|<>=~^]*$/.exec(range)?.[1];
  return operator && operator === rangeOperators[mode] ? undefined : range;
}

export type AutoUpgradeSettings = {
  mode: AutoUpgradeMode;
  semverFilter?: string;
  includePrereleases: boolean;
  /** The range for the edit template's custom range mode, if the fixed modes cannot write it back */
  semverRange?: string;
};

/**
 * The automatic upgrades of an OCIRepository reference, as the deployment
 * page shows them and the edit template writes them back.
 *
 * @param ref - The OCIRepository `spec.ref`
 * @param currentVersion - The version Flux currently resolves the range to, if known
 */
export function deriveAutoUpgradeSettings(
  ref: OciRepositoryRef | undefined,
  currentVersion?: string,
): AutoUpgradeSettings {
  const mode = deriveAutoUpgradeMode(ref, currentVersion);
  return {
    mode,
    semverFilter: deriveSemverFilter(ref),
    includePrereleases: rangeIncludesPrereleases(ref),
    semverRange: deriveCustomRange(ref, mode),
  };
}

export type AutoUpgradeDescription = {
  /** The label, ending in "tags matching" when `filter` follows it */
  label: string;
  /** A filter the guide does not document, to show as its regular expression */
  filter?: string;
};

function lowerFirst(text: string) {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/**
 * Describes automatic upgrades: the mode, narrowed by the tag filter Flux
 * applies first (a documented release stage by its name, any other filter as
 * its regular expression) and by whether the range admits pre-releases.
 * Backstage has no tag list here, so it never evaluates the filter.
 */
export function describeAutoUpgrades({
  mode,
  semverFilter,
  includePrereleases,
}: AutoUpgradeSettings): AutoUpgradeDescription {
  const modeLabel = autoUpgradeLabels[mode];
  if (mode === 'no-upgrades') return { label: modeLabel };
  const narrow = (label: string) =>
    mode === 'major-upgrades' ? label : `${modeLabel}, ${lowerFirst(label)}`;

  if (!semverFilter) {
    return {
      label: includePrereleases
        ? `${modeLabel}, including pre-releases`
        : modeLabel,
    };
  }

  const stage = releaseStages.get(semverFilter);
  if (!stage) return { label: narrow('Tags matching'), filter: semverFilter };

  return {
    label: includePrereleases
      ? narrow(stage)
      : `${narrow(stage)}, but the range admits no pre-release`,
  };
}
