import { SyncMark, SyncMarkLabel } from '@giantswarm/backstage-plugin-ui-react';
import {
  CapabilityState,
  CapabilityStateName,
  VerifyMark,
  VerifyResult,
} from '../apis';
import { compared, countsOf, foundWords, redProbeOf } from '../lib/comparison';

/** The page's word for each of the manager's states; the manager's own never appear. */
export const STATE_WORDS: Record<CapabilityStateName, string> = {
  'not enabled': 'Not installed',
  'pending approval': 'Pending approval',
  'rolling out': 'Rolling out',
  'waiting for the customer': 'Waiting for the customer',
  enabled: 'Installed',
  drifted: 'Installed · differences',
  failed: 'Failed',
  unknown: 'Unknown',
};

/**
 * What each mark means for a capability, in the page's words: the legend of
 * the Installations page's columns and the tooltip of the tab's header, so
 * the glyph next to a capability means the same on both pages.
 */
export const MARK_GLOSS: Record<SyncMark, string> = {
  'in sync': 'Installed',
  'not in sync': 'Installed, with differences',
  'not reconciled': 'Enabling, or not checked yet',
  'not installed': 'Not installed',
  failed: 'Failed',
  unknown: 'Unknown',
};

/** A mark's line of the legend: the mark and its gloss. */
export function glossOf(mark: SyncMark): string {
  return `${mark}: ${MARK_GLOSS[mark]}`;
}

/**
 * The mark of a comparison's finding on one check, file or value, in the
 * same six marks the header and the Installations page use: a difference
 * to apply is `not in sync`, a change the next apply makes is `not
 * reconciled`, a check that did not run cannot say.
 */
const MARK_OF_FINDING: Record<VerifyMark, SyncMark> = {
  'as defined': 'in sync',
  drifted: 'not in sync',
  'differs by input': 'not in sync',
  planned: 'not reconciled',
  'not checked': 'unknown',
};

/** What a finding's mark says, for its tooltip. */
const FINDING_GLOSS: Record<VerifyMark, string> = {
  'as defined': 'as the definition renders it',
  drifted: 'differs from what the definition renders',
  'differs by input': 'differs by a choice that changed',
  planned: 'a change the next apply makes',
  'not checked': 'the check did not run',
};

/**
 * The mark of a capability's listing entry: the manager's ten states folded
 * into the portal's six marks (the same icons the Repositories page uses for
 * a repository's set-up), read with its last action.
 */
export function markOf(
  capability: Pick<CapabilityState, 'state' | 'lastAction'>,
): SyncMark {
  switch (capability.state) {
    case 'enabled':
      // The fileset is on record; only an action the manager rolled out and
      // verified says the installation is as defined.
      return capability.lastAction?.result === 'enabled'
        ? 'in sync'
        : 'not reconciled';
    case 'drifted':
      return 'not in sync';
    case 'pending approval':
    case 'rolling out':
    case 'waiting for the customer':
      // An action still in flight, so "as defined" cannot be claimed yet.
      return 'not reconciled';
    case 'not enabled':
      // Nothing is on record.
      return 'not installed';
    case 'failed':
      return 'failed';
    default:
      // The installation's repositories could not be read as the person.
      return 'unknown';
  }
}

/** What the page says about a capability, and the mark it says it under. */
export interface Status {
  words: string;
  mark: SyncMark;
}

/**
 * The header line of a capability: its phase and, after the middle dot or
 * the colon, what the comparison found -- the differences and the planned
 * changes, the customer's action, the red probe, or `not compared` where
 * the comparison did not run. Without a comparison (the Installations page,
 * the comparison still running) the phase alone, in the same words, under
 * the mark the Installations page shows.
 */
export function statusOf(
  capability: Pick<CapabilityState, 'state' | 'lastAction'>,
  comparison?: VerifyResult,
): Status {
  const { state } = capability;
  switch (state) {
    case 'enabled':
    case 'drifted': {
      if (!comparison) {
        return { words: STATE_WORDS[state], mark: markOf(capability) };
      }
      if (!compared(comparison)) {
        return { words: 'Installed · not compared', mark: 'unknown' };
      }
      const counts = countsOf(comparison);
      const found = foundWords(counts, 'check');
      if (found.length === 0) {
        return { words: 'Installed · up to date', mark: 'in sync' };
      }
      return {
        words: ['Installed', ...found].join(' · '),
        mark: counts.differences > 0 ? 'not in sync' : 'not reconciled',
      };
    }
    case 'pending approval':
    case 'rolling out': {
      const verb = capability.lastAction?.name.startsWith('reconcile')
        ? 'Applying'
        : 'Enabling';
      return { words: `${verb} · ${state}`, mark: 'not reconciled' };
    }
    case 'waiting for the customer': {
      const action = comparison?.customerActions?.[0]?.action;
      return {
        words: action ? `${STATE_WORDS[state]}: ${action}` : STATE_WORDS[state],
        mark: 'not reconciled',
      };
    }
    case 'failed': {
      const probe = redProbeOf(comparison);
      return {
        words: probe ? `${STATE_WORDS[state]}: ${probe}` : STATE_WORDS[state],
        mark: 'failed',
      };
    }
    case 'not enabled':
      return comparison?.refused
        ? { words: 'Not installed · not compared', mark: 'unknown' }
        : { words: STATE_WORDS[state], mark: 'not installed' };
    default:
      return {
        words: STATE_WORDS[state] ?? STATE_WORDS.unknown,
        mark: 'unknown',
      };
  }
}

/**
 * A capability's state in the page's words next to its mark's glyph, the
 * legend's line for the mark on the tooltip; `data-state` keeps the
 * manager's state for tests. With a `status` the tag carries the header
 * line the comparison produced instead.
 */
export function StateTag({
  state,
  status = statusOf({ state }),
  testId,
}: {
  state: CapabilityStateName;
  status?: Status;
  testId?: string;
}) {
  return (
    <SyncMarkLabel
      mark={status.mark}
      label={status.words}
      title={glossOf(status.mark)}
      state={state}
      testId={testId}
    />
  );
}

/**
 * A comparison's finding with its mark's glyph: `as defined`, `differs by
 * input`, `drifted`, `planned`, `not checked`. With `words`, those words
 * next to the glyph instead of the mark: a difference's reason.
 */
export function MarkTag({
  mark,
  words = mark,
  testId,
}: {
  mark: VerifyMark;
  words?: string;
  testId?: string;
}) {
  return (
    <SyncMarkLabel
      mark={MARK_OF_FINDING[mark] ?? 'unknown'}
      label={words}
      title={FINDING_GLOSS[mark]}
      state={mark}
      testId={testId}
    />
  );
}
