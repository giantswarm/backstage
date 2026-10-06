import BlockIcon from '@material-ui/icons/Block';
import RemoveCircleOutlineIcon from '@material-ui/icons/RemoveCircleOutline';
import ThumbDownOutlinedIcon from '@material-ui/icons/ThumbDownOutlined';
import UndoIcon from '@material-ui/icons/Undo';
import { SyncMark, SyncMarkLabel } from '@giantswarm/backstage-plugin-ui-react';
import { ActionStateName, CapabilityStateName } from '../apis';
import {
  Look,
  LookLabel,
  READY_TO_MERGE_STEP,
  STATE_WORDS,
  StateTag,
  under,
} from './StateTag';

/** The states an action has and an installation has not. */
type OwnState = Exclude<ActionStateName, CapabilityStateName>;

/** How an own state looks: a tone and a glyph of its own, or one of the installation's marks. */
type OwnLook = Look | { mark: SyncMark };

/**
 * The page's word and look for each of the action's own states, with what
 * the state means for the tooltip. A refusal is something to fix before
 * asking again, so it warns; a revert left the capability on record without
 * the action's change, so it reads *not in sync* like a drift until its
 * actor withdraws it; a denial, a withdrawal and a removal are decisions
 * taken, so they stay neutral. Each glyph has its own silhouette -- the
 * barred circle, the thumb down, the sync with a bang, the minus in a
 * circle, the undo arrow -- so the state survives greyscale.
 */
const OWN_STATES: Record<OwnState, OwnLook & { words: string; gloss: string }> =
  {
    refused: {
      words: 'Refused',
      intent: 'warning',
      icon: BlockIcon,
      gloss: 'The manager refused it before anything was written.',
    },
    denied: {
      words: 'Denied',
      intent: 'neutral',
      icon: ThumbDownOutlinedIcon,
      gloss:
        'A member of the team denied it in the review; nothing was merged.',
    },
    reverted: {
      words: 'Reverted',
      mark: 'not in sync',
      gloss:
        'Its pull requests were reverted on the default branch: the capability stays on record, the change is gone. Its actor can withdraw it.',
    },
    withdrawn: {
      words: 'Withdrawn',
      intent: 'neutral',
      icon: RemoveCircleOutlineIcon,
      gloss:
        'Its actor withdrew it after the merge; any pull request still open was closed.',
    },
    removed: {
      words: 'Removed',
      intent: 'neutral',
      icon: UndoIcon,
      gloss: "The files it wrote left the repositories' default branch again.",
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
  'ready to merge': 'not reconciled',
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
  ...(Object.fromEntries(
    Object.entries(OWN_STATES).map(([state, { words }]) => [state, words]),
  ) as Record<OwnState, string>),
};

function isOwn(state: ActionStateName): state is OwnState {
  return state in OWN_STATES;
}

/**
 * An action's state in the page's words next to its glyph: the same label
 * the card's header uses, with the mark of the installation's state the
 * action produced, or the action's own word and look -- *Refused*,
 * *Denied*, *Reverted*, *Withdrawn*, *Removed* -- with what it means on the
 * tooltip, followed by `detail` where the record says more: who withdrew it
 * and why, the commit that reverted it. `data-state` keeps the manager's
 * state for tests.
 */
export function ActionStateTag({
  state,
  detail,
  testId = 'action-state',
}: {
  state: ActionStateName;
  detail?: string;
  testId?: string;
}) {
  if (isOwn(state)) {
    const own = OWN_STATES[state];
    const gloss = detail ? `${own.gloss} ${detail}` : own.gloss;
    if ('mark' in own) {
      return (
        <SyncMarkLabel
          mark={own.mark}
          label={own.words}
          title={gloss}
          state={state}
          testId={testId}
        />
      );
    }
    return (
      <LookLabel
        look={own}
        words={own.words}
        gloss={gloss}
        state={state}
        testId={testId}
      />
    );
  }
  const status = under(STATE_WORDS[state], MARK[state]);
  return (
    <StateTag
      state={state}
      status={
        state === 'ready to merge'
          ? { ...status, gloss: READY_TO_MERGE_STEP }
          : status
      }
      testId={testId}
    />
  );
}
