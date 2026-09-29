import { SyncMark, SyncMarkLabel } from '@giantswarm/backstage-plugin-ui-react';
import {
  CapabilityState,
  CapabilityStateName,
  VerifyMark,
  VerifyResult,
} from '../apis';
import {
  compared,
  countsOf,
  foundWords,
  notComparedReason,
  redProbeOf,
} from '../lib/comparison';

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

/** What the page says about a capability, the mark it says it under, and what the mark means here. */
export interface Status {
  words: string;
  mark: SyncMark;
  /**
   * The mark's tooltip: its line of the legend and, where the header says
   * `not compared`, that the comparison did not run and why, in the
   * manager's words.
   */
  gloss: string;
}

/** The words under a mark, the legend's line for the mark on the gloss. */
export function under(words: string, mark: SyncMark): Status {
  return { words, mark, gloss: glossOf(mark) };
}

/**
 * The header where the comparison did not run: the phase with `not
 * compared`, under the mark the listing gives the capability -- the one the
 * Installations page's cell shows -- the gloss saying it was not compared
 * and why. Never `unknown`: the manager did say what is on record.
 */
function notCompared(
  phase: string,
  capability: Pick<CapabilityState, 'state' | 'lastAction'>,
  comparison: VerifyResult,
): Status {
  const mark = markOf(capability);
  const reason = notComparedReason(comparison);
  return {
    words: `${phase} · not compared`,
    mark,
    gloss: `${glossOf(mark)}, not compared${reason ? `: ${reason}` : ''}`,
  };
}

/**
 * The header line of a capability: its phase and, after the middle dot or
 * the colon, what the comparison found -- the differences and the planned
 * changes, the customer's action, the red probe, or `not compared` where
 * the comparison did not run, the mark then the listing's and its gloss
 * carrying the manager's reason. Without a comparison (the Installations
 * page, the comparison still running) the phase alone, in the same words,
 * under the mark the Installations page shows.
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
        return under(STATE_WORDS[state], markOf(capability));
      }
      if (!compared(comparison)) {
        return notCompared('Installed', capability, comparison);
      }
      const counts = countsOf(comparison);
      const found = foundWords(counts, 'check');
      if (found.length === 0) {
        return under('Installed · up to date', 'in sync');
      }
      return under(
        ['Installed', ...found].join(' · '),
        counts.differences > 0 ? 'not in sync' : 'not reconciled',
      );
    }
    case 'pending approval':
    case 'rolling out': {
      const verb = capability.lastAction?.name.startsWith('reconcile')
        ? 'Applying'
        : 'Enabling';
      return under(`${verb} · ${state}`, 'not reconciled');
    }
    case 'waiting for the customer': {
      const action = comparison?.customerActions?.[0]?.action;
      return under(
        action ? `${STATE_WORDS[state]}: ${action}` : STATE_WORDS[state],
        'not reconciled',
      );
    }
    case 'failed': {
      const probe = redProbeOf(comparison);
      return under(
        probe ? `${STATE_WORDS[state]}: ${probe}` : STATE_WORDS[state],
        'failed',
      );
    }
    case 'not enabled':
      return comparison?.refused
        ? notCompared('Not installed', capability, comparison)
        : under(STATE_WORDS[state], 'not installed');
    default:
      return under(STATE_WORDS[state] ?? STATE_WORDS.unknown, 'unknown');
  }
}

/**
 * A capability's state in the page's words next to its mark's glyph, the
 * mark's gloss on the tooltip -- the legend's line, with why the comparison
 * did not run where it did not; `data-state` keeps the manager's state for
 * tests. With a `status` the tag carries the header line the comparison
 * produced instead.
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
      title={status.gloss}
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
