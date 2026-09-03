import type { StatusLabelIntent } from '@giantswarm/backstage-plugin-ui-react';

/**
 * The single source of truth for how release-readiness verdicts are presented.
 *
 * The column, the card and the sidebar picker all render the same three
 * verdicts, and each used to keep its own copy of these maps. Three copies mean
 * a verdict added to the processor can be added to two of them and forgotten in
 * the third — and a verdict missing from the picker's order renders raw and
 * lowercase *and* sorts to the top of the checkbox list, because
 * `EntityCheckboxesPicker` orders by `optionsOrder.indexOf(option)` and an
 * unknown key yields -1.
 */

/**
 * Verdicts in the order a reader should meet them. Blocked first: a health
 * column and a health filter should both lead with what needs attention.
 */
export const READINESS_ORDER = ['blocked', 'unknown', 'releasable'];

/**
 * Verdicts as a reader should see them. `unknown` is spelled out rather than
 * shown as a blank, because "we could not tell" and "nothing wrong" are
 * different answers. Capitalised because a sidebar reading `blocked` next to a
 * column reading `Blocked` looks like a different value.
 */
export const READINESS_LABELS: Record<string, string> = {
  blocked: 'Blocked',
  unknown: 'Unknown',
  releasable: 'Releasable',
};

export const READINESS_INTENTS: Record<string, StatusLabelIntent> = {
  blocked: 'negative',
  unknown: 'neutral',
  releasable: 'positive',
};

export const READINESS_MEANINGS: Record<string, string> = {
  blocked: 'The newest release did not reach the chart registry.',
  unknown:
    'Could not be determined — an unresolvable chart, a private registry, a monorepo release prefix, or a release tag that is not comparable.',
  releasable: 'The newest release is present in the chart registry.',
};

export function readinessLabel(readiness: string): string {
  return READINESS_LABELS[readiness] ?? readiness;
}

export function readinessIntent(readiness: string): StatusLabelIntent {
  return READINESS_INTENTS[readiness] ?? 'neutral';
}

/** Sort key for the column. A verdict we do not know about sorts last. */
export function readinessRank(readiness?: string): number {
  const index = readiness ? READINESS_ORDER.indexOf(readiness) : -1;

  return index === -1 ? READINESS_ORDER.length : index;
}

/**
 * The blockers `AppReadinessProcessor` writes. Everything else appearing in
 * `giantswarm.io/readiness-flags` is an enforced chart-metadata gap from the
 * catalog importer, which merges into the same annotation.
 */
export const RELEASE_READINESS_FLAGS = [
  'RELEASE-NOT-PUBLISHED',
  'NEVER-PUBLISHED',
];

/**
 * Splits the merged flag list back into the two verdicts that write it.
 *
 * `giantswarm.io/readiness-flags` carries both the release blockers above and
 * the importer's enforced chart-metadata gaps (`META-NO-TEAM`,
 * `NO-VALUES-SCHEMA`). They answer different questions — "can this be released"
 * versus "does this chart build" — so anything presenting them must attribute
 * each to its own verdict rather than listing them under one claim.
 */
export function partitionReadinessFlags(flags: string[]): {
  release: string[];
  chartMetadata: string[];
} {
  return {
    release: flags.filter(flag => RELEASE_READINESS_FLAGS.includes(flag)),
    chartMetadata: flags.filter(
      flag => !RELEASE_READINESS_FLAGS.includes(flag),
    ),
  };
}

/**
 * The catalog importer's chart-metadata verdict. `incomplete` means the chart
 * carries a gap that fails a build today; it deliberately ignores advisory
 * gaps, which four charts in five carry.
 */
export const STANDARDS_LABELS: Record<string, string> = {
  ok: 'Meets the standard',
  incomplete: 'Incomplete',
};

export const STANDARDS_INTENTS: Record<string, StatusLabelIntent> = {
  ok: 'positive',
  incomplete: 'negative',
};
