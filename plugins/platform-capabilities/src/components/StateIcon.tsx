import { ComponentType } from 'react';
import Tooltip from '@material-ui/core/Tooltip';
import { SvgIconProps } from '@material-ui/core/SvgIcon';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import ErrorIcon from '@material-ui/icons/Error';
import HelpOutlineIcon from '@material-ui/icons/HelpOutline';
import RadioButtonUncheckedIcon from '@material-ui/icons/RadioButtonUnchecked';
import SyncIcon from '@material-ui/icons/Sync';
import SyncProblemIcon from '@material-ui/icons/SyncProblem';
import { CapabilityState } from '../apis';
import { STATE_COLOR } from './StateTag';

/**
 * What one glance at the Installations table says about a capability on an
 * installation: the manager's nine states folded into the four a person
 * scanning the fleet asks about, plus the two that need a look.
 */
export type CapabilityMark =
  /** Installed, and the manager's last action verified it as defined. */
  | 'in sync'
  /** Installed, and the last verify found it off its definition. */
  | 'not in sync'
  /**
   * Installed or under way, and the manager has not reconciled it yet: an
   * action still in flight, or an installation enabled by hand that no action
   * has ever run through, so "as defined" cannot be claimed for it.
   */
  | 'not reconciled'
  /** Not enabled, or not opted in. */
  | 'not installed'
  /** The last action or verify failed. */
  | 'failed'
  /** The installation's repositories could not be read as the person. */
  | 'unknown';

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
      return 'not reconciled';
    case 'not enabled':
    case 'not opted in':
      return 'not installed';
    case 'failed':
      return 'failed';
    default:
      return 'unknown';
  }
}

const ICON: Record<
  CapabilityMark,
  { icon: ComponentType<SvgIconProps>; color: string; gloss: string }
> = {
  'in sync': {
    icon: CheckCircleIcon,
    color: STATE_COLOR.enabled,
    gloss: 'installed, as defined',
  },
  'not in sync': {
    icon: SyncProblemIcon,
    color: STATE_COLOR.drifted,
    gloss: 'installed, off its definition',
  },
  'not reconciled': {
    icon: SyncIcon,
    color: STATE_COLOR['rolling out'],
    gloss: 'not reconciled yet',
  },
  'not installed': {
    icon: RadioButtonUncheckedIcon,
    color: STATE_COLOR['not enabled'],
    gloss: 'not installed',
  },
  failed: {
    icon: ErrorIcon,
    color: STATE_COLOR.failed,
    gloss: 'the last action or verify failed',
  },
  unknown: {
    icon: HelpOutlineIcon,
    color: STATE_COLOR.unknown,
    gloss: 'not readable as you',
  },
};

/** The legend of the marks, for a column's header. */
export const MARK_LEGEND = (
  Object.entries(ICON) as [CapabilityMark, { gloss: string }][]
)
  .map(([mark, { gloss }]) => `${mark}: ${gloss}`)
  .join(' · ');

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
  const { icon: Icon, color, gloss } = ICON[mark];
  const label = `${capability.state} · ${gloss}`;
  return (
    <Tooltip title={label} placement="top" arrow>
      <span
        role="img"
        aria-label={label}
        data-testid={testId}
        data-state={capability.state}
        data-mark={mark}
        style={{ display: 'inline-flex', alignItems: 'center', color }}
      >
        <Icon fontSize="small" color="inherit" />
      </span>
    </Tooltip>
  );
}
