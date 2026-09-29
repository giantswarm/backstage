import { ComponentType, CSSProperties } from 'react';
import Tooltip from '@material-ui/core/Tooltip';
import { SvgIconProps } from '@material-ui/core/SvgIcon';
import BlockIcon from '@material-ui/icons/Block';
import RemoveCircleOutlineIcon from '@material-ui/icons/RemoveCircleOutline';
import UndoIcon from '@material-ui/icons/Undo';
import {
  StatusLabel,
  StatusLabelIntent,
  SyncMark,
} from '@giantswarm/backstage-plugin-ui-react';
import { ActionStateName, CapabilityStateName } from '../apis';
import { STATE_WORDS, StateTag, under } from './StateTag';

/** The states an action has and an installation has not. */
type OwnState = Exclude<ActionStateName, CapabilityStateName>;

/**
 * The page's word, tone and glyph for each of the action's own states, with
 * what the state means for the tooltip. A refusal is something to fix
 * before asking again, so it warns; a withdrawal and a revert are decisions
 * taken, so they stay neutral. Each glyph has its own silhouette -- the
 * barred circle, the minus in a circle, the undo arrow -- so the state
 * survives greyscale.
 */
const OWN_STATES: Record<
  OwnState,
  {
    words: string;
    intent: StatusLabelIntent;
    icon: ComponentType<SvgIconProps>;
    gloss: string;
  }
> = {
  refused: {
    words: 'Refused',
    intent: 'warning',
    icon: BlockIcon,
    gloss: 'The manager refused it before anything was written.',
  },
  denied: {
    words: 'Withdrawn',
    intent: 'neutral',
    icon: RemoveCircleOutlineIcon,
    gloss: 'A member of the team withdrew it; nothing was merged.',
  },
  removed: {
    words: 'Reverted',
    intent: 'neutral',
    icon: UndoIcon,
    gloss: 'The files it wrote left the repositories again.',
  },
};

/**
 * The mark of an action in one of the installation's states. The state is
 * the action's own result, so an action that reached `enabled` rolled out
 * and verified: it is as defined, where a capability merely on record is
 * not reconciled until an action says so.
 */
const MARK: Record<CapabilityStateName, SyncMark> = {
  'not enabled': 'not installed',
  'pending approval': 'not reconciled',
  'rolling out': 'not reconciled',
  'waiting for the customer': 'not reconciled',
  enabled: 'in sync',
  drifted: 'not in sync',
  failed: 'failed',
  unknown: 'unknown',
};

/** The page's word for each state an action can be in; nothing reads Unknown for a known state. */
export const ACTION_STATE_WORDS: Record<ActionStateName, string> = {
  ...STATE_WORDS,
  refused: OWN_STATES.refused.words,
  denied: OWN_STATES.denied.words,
  removed: OWN_STATES.removed.words,
};

const INLINE: CSSProperties = { display: 'inline-flex' };

function isOwn(state: ActionStateName): state is OwnState {
  return state in OWN_STATES;
}

/**
 * An action's state in the page's words next to its glyph: the same label
 * the card's header uses, with the mark of the installation's state the
 * action produced, or the action's own word, tone and glyph -- *Refused*,
 * *Withdrawn*, *Reverted* -- with what it means on the tooltip.
 * `data-state` keeps the manager's state for tests.
 */
export function ActionStateTag({
  state,
  testId = 'action-state',
}: {
  state: ActionStateName;
  testId?: string;
}) {
  if (isOwn(state)) {
    const { words, intent, icon, gloss } = OWN_STATES[state];
    return (
      <Tooltip title={gloss} placement="top" arrow>
        <span data-testid={testId} data-state={state} style={INLINE}>
          <StatusLabel label={words} intent={intent} icon={icon} inline />
        </span>
      </Tooltip>
    );
  }
  return (
    <StateTag
      state={state}
      status={under(STATE_WORDS[state], MARK[state])}
      testId={testId}
    />
  );
}
