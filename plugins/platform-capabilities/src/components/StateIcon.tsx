import {
  SyncMark,
  SyncMarkIcon,
  syncMarkLegend,
} from '@giantswarm/backstage-plugin-ui-react';
import { CapabilityState } from '../apis';
import { statusOf } from './StateTag';

/**
 * What one glance at the Installations table says about a capability on an
 * installation: the manager's ten states folded into the portal's six marks
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

/** What each mark means for a capability, in the column's legend, in the page's words. */
const GLOSS: Record<CapabilityMark, string> = {
  'in sync': 'Installed',
  'not in sync': 'Installed, with differences',
  'not reconciled': 'Enabling, or not checked yet',
  'not installed': 'Not installed',
  failed: 'Failed',
  unknown: 'Unknown',
};

/** The legend of the marks, for a column's header. */
export const MARK_LEGEND = syncMarkLegend(GLOSS);

/**
 * A capability's state on an installation as one icon: the shape and colour
 * carry the mark, the tooltip and the accessible name carry the same words
 * the Capabilities tab's header uses. `data-state` stays the manager's
 * state, as the list's cells have always exposed it.
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
      label={statusOf(capability).words}
      testId={testId}
    />
  );
}
