import type { StatusLabelIntent } from '@giantswarm/backstage-plugin-ui-react';
import semver from 'semver';
import type { BuildToolchain } from './entity';

/**
 * The single source of truth for how build verdicts and the declared build
 * toolchain are presented — for the same reason `readiness.ts` exists: the
 * column, the card and the sidebar picker render the same values, and three
 * copies of a map is how one of them drifts.
 */

/** Verdicts in the order a reader should meet them. Failing first. */
export const BUILD_STATUS_ORDER = ['failing', 'unknown', 'passing'];

export const BUILD_STATUS_LABELS: Record<string, string> = {
  failing: 'Failing',
  unknown: 'Unknown',
  passing: 'Passing',
};

export const BUILD_STATUS_INTENTS: Record<string, StatusLabelIntent> = {
  failing: 'negative',
  unknown: 'neutral',
  passing: 'positive',
};

export const BUILD_STATUS_MEANINGS: Record<string, string> = {
  failing:
    'A check on the default branch is failing, confirmed to have run on that branch.',
  unknown:
    'Could not be determined — a failing status whose build could not be traced to a branch, a private CircleCI project, or more checks than fit in one page.',
  passing: 'Every check reporting to the default branch is green.',
};

export function buildStatusLabel(status: string): string {
  return BUILD_STATUS_LABELS[status] ?? status;
}

export function buildStatusIntent(status: string): StatusLabelIntent {
  return BUILD_STATUS_INTENTS[status] ?? 'neutral';
}

/** Sort key for the column. A verdict we do not know about sorts last. */
export function buildStatusRank(status?: string): number {
  const index = status ? BUILD_STATUS_ORDER.indexOf(status) : -1;

  return index === -1 ? BUILD_STATUS_ORDER.length : index;
}

/**
 * The orb version as a cell shows it: the release version, or the raw ref for
 * a repo pinned to something that is not a release.
 */
export function toolchainOrbText(toolchain: BuildToolchain): string {
  return toolchain.orbVersion ?? toolchain.orbRef ?? '';
}

/**
 * The hover detail for a toolchain cell: what the orb pins in turn, and whether
 * the repo overrides the ATS default. Each line names the tool in full, since
 * "ABS" and "ATS" are only obvious to the people who maintain them.
 */
export function toolchainTitle(toolchain: BuildToolchain): string {
  const lines: string[] = [];
  if (toolchain.orbVersion) {
    lines.push(`architect orb ${toolchain.orbVersion}`);
  } else if (toolchain.orbRef) {
    lines.push(`architect orb pinned to ${toolchain.orbRef}, not a release`);
  }
  if (toolchain.absVersion) {
    lines.push(`app-build-suite ${toolchain.absVersion}`);
  }
  if (toolchain.atsVersion) {
    lines.push(
      `app-test-suite ${toolchain.atsVersion}${
        toolchain.atsSource === 'repo' ? ' (repo override)' : ''
      }`,
    );
  }
  return lines.join('\n');
}

/**
 * Newest orb first, releases before non-release pins, and two non-release pins
 * in name order. For the sidebar picker, where a version list that reads
 * 10.1.0, 10.10.0, 10.2.0 is worse than no order at all.
 */
export function compareOrbVersionsDesc(a: string, b: string): number {
  const va = semver.valid(a);
  const vb = semver.valid(b);
  if (va && vb) {
    return semver.rcompare(va, vb);
  }
  if (va) {
    return -1;
  }
  if (vb) {
    return 1;
  }
  return a.localeCompare(b);
}
