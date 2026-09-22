import {
  SyncMark,
  SyncMarkIcon,
  syncMarkLegend,
} from '@giantswarm/backstage-plugin-ui-react';
import { CapabilityState } from '../apis';
import { MARK_GLOSS, markOf, statusOf } from './StateTag';

/**
 * What one glance at the Installations table says about a capability on an
 * installation: the manager's ten states folded into the portal's six marks
 * (the same icons the Repositories page uses for a repository's set-up).
 */
export type CapabilityMark = SyncMark;

/** The legend of the marks, for a column's header. */
export const MARK_LEGEND = syncMarkLegend(MARK_GLOSS);

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
