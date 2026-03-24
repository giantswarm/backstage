export type AutoUpgradeMode =
  | 'no-upgrades'
  | 'patch-upgrades'
  | 'minor-upgrades'
  | 'major-upgrades';

const autoUpgradeLabels: Record<AutoUpgradeMode, string> = {
  'no-upgrades': 'None',
  'patch-upgrades': 'Patch',
  'minor-upgrades': 'Minor and patch',
  'major-upgrades': 'Any',
};

/**
 * Derives automatic upgrade mode from an OCIRepository reference.
 *
 * Supports Masterminds/semver constraint syntax used by Flux:
 * - Tilde ranges (`~1.2.3`) and patch wildcards (`1.2.x`) → patch upgrades
 * - Caret ranges (`^1.2.3`) and minor wildcards (`1.x`, `1.x.x`) → minor and patch upgrades
 * - Comparison operators (`>=1.2.3`, `>1.2.3`) and full wildcards (`*`) → major, minor and patch upgrades
 * - No semver (pinned tag) → no automatic upgrades
 */
export function deriveAutoUpgradeMode(
  ref: { semver?: string; tag?: string } | undefined,
): AutoUpgradeMode {
  if (!ref?.semver) return 'no-upgrades';

  const s = ref.semver.trim();

  // Tilde range: ~1.2.3, ~1, ~2.3 → patch-level changes
  if (s.startsWith('~')) return 'patch-upgrades';

  // Caret range: ^1.2.3, ^0.2.3 → minor-level changes
  if (s.startsWith('^')) return 'minor-upgrades';

  // Greater-than operators: >=1.2.3, >1.2.3 → major-level changes
  if (s.startsWith('>=') || s.startsWith('>')) return 'major-upgrades';

  // Patch-level wildcard: 1.2.x, 1.2.*, 1.2.X
  if (/^\d+\.\d+\.[xX*]$/.test(s)) return 'patch-upgrades';

  // Minor-level wildcard: 1.x, 1.*, 1.x.x, 1.*.*, 1.X, 1.X.X
  if (/^\d+\.[xX*](\.[xX*])?$/.test(s)) return 'minor-upgrades';

  // Full wildcard: *, x, X
  if (/^[xX*]$/.test(s)) return 'major-upgrades';

  return 'no-upgrades';
}

export function getAutoUpgradeLabel(mode: AutoUpgradeMode): string {
  return autoUpgradeLabels[mode];
}
