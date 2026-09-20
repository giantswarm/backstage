import {
  SyncMark,
  SyncMarkIcon,
  syncMarkLegend,
} from '@giantswarm/backstage-plugin-ui-react';
import { CapabilityState } from '../apis';

/**
 * What one glance at the Installations table says about a capability on an
 * installation: the manager's nine states folded into the portal's six marks
 * (the same icons the Repositories page uses for a repository's set-up).
 */
export type CapabilityMark = SyncMark;

/** The mark of a capability's listing entry: its state, read with its last action. */
export function markOf(
  capability: Pick<CapabilityState, 'state' | 'lastAction'>,
): CapabilityMark {
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
      // An action still in flight, or an installation enabled by hand that no
      // action has ever run through, so "as defined" cannot be claimed for it.
      return 'not reconciled';
    case 'not enabled':
    case 'not opted in':
      return 'not installed';
    case 'failed':
      return 'failed';
    default:
      // The installation's repositories could not be read as the person.
      return 'unknown';
  }
}

/** What each mark means for a capability, in the tooltip and the legend. */
const GLOSS: Record<CapabilityMark, string> = {
  'in sync': 'installed, as defined',
  'not in sync': 'installed, off its definition',
  'not reconciled': 'not reconciled yet',
  'not installed': 'not installed',
  failed: 'the last action or verify failed',
  unknown: 'not readable as you',
};

/** The legend of the marks, for a column's header. */
export const MARK_LEGEND = syncMarkLegend(GLOSS);

/**
 * A capability's state on an installation as one icon: the shape and colour
 * carry the mark, the tooltip and the accessible name carry the manager's
 * state in its own words. `data-state` stays the state, as the list's cells
 * have always exposed it.
 */
export function StateIcon({
  capability,
  testId,
}: {
  capability: Pick<CapabilityState, 'state' | 'lastAction'>;
  testId?: string;
}) {
  const mark = markOf(capability);
  return (
    <SyncMarkIcon
      mark={mark}
      state={capability.state}
      label={`${capability.state} · ${GLOSS[mark]}`}
      testId={testId}
    />
  );
}
