import { Alert } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { countNoun } from '@giantswarm/backstage-plugin-ui-react';
import type { Continuation } from '../../../lib/continuationPrompt';
import { newSessionBlockedText, newSessionElsewhereText } from '../helpers';

const useStyles = makeStyles(theme => ({
  description: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
  },
  // The person's own words, kept in sight and set apart from the explanation.
  answer: {
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  },
}));

export type AnswerNotTakenNoticeProps = {
  /** The agent's display name, for the way out. Absent when no Agent matched. */
  agentName?: string;
  /**
   * Whether the composer below offers the new session. When it cannot (no
   * addressable agent, a blocker), the notice says where else to go.
   */
  offersNewSession: boolean;
  /**
   * Why no new session can start with the agent from this portal
   * (`AgentRow.sessionBlocker`): the way out names it instead of a button.
   */
  newSessionBlocker?: string;
  /**
   * The answer to a question that was not taken, which the new session's
   * first message carries. Absent for an approval, whose words mean nothing
   * to a new session.
   */
  answer?: string;
  /**
   * What the new session's first message carries of this conversation
   * (`buildContinuationPrompt`), so the notice can say so before it starts.
   */
  continuation?: Pick<Continuation, 'messageCount' | 'includedMessageCount'>;
  /** Why the last attempt to start the new session failed, when it did. */
  startError?: string;
};

/**
 * What the new session starts with, in a sentence: how much of this
 * conversation, the open question, and the answer or the box's text.
 */
function describeStart(
  continuation: AnswerNotTakenNoticeProps['continuation'],
  hasAnswer: boolean,
): string {
  const tail = hasAnswer
    ? 'the open question and your answer'
    : 'the open question and the text in the box';
  const replaces = hasAnswer ? '; text in the box replaces the answer' : '';
  if (!continuation || continuation.messageCount === 0) {
    return `Its first message holds this conversation, with tools named but not their results, ${tail}${replaces}.`;
  }
  const { messageCount, includedMessageCount } = continuation;
  const messages = countNoun(messageCount, 'message');
  // None fit beside a long answer: say so, rather than "the newest 0".
  if (includedMessageCount === 0) {
    return `Its first message holds ${tail}; this conversation's ${messages} do not fit beside them.`;
  }
  const conversation =
    includedMessageCount < messageCount
      ? `the newest ${includedMessageCount} of this conversation's ${messages}`
      : `this conversation (${messages})`;
  return `Its first message holds ${conversation}, with tools named but not their results, ${tail}${replaces}.`;
}

/**
 * The words for an answer kagent did not take (`isAnswerNotTakenError`): the
 * agent could not resume, the question is still open, and sending the answer
 * again goes the same way. It takes the question card's place, so nothing on
 * the page invites a retry, and points at the new session the composer offers
 * under it.
 *
 * The answer is shown here rather than put in the message box: the notice
 * goes when a late resume moves the task on, and the answer goes with it,
 * where a box would keep it beside a live Send.
 *
 * Danger, like a reported runtime loss: this session cannot go on. Unlike that
 * notice it names no cause, because kagent reports none; it says what the page
 * saw.
 */
export function AnswerNotTakenNotice({
  agentName,
  offersNewSession,
  newSessionBlocker,
  answer,
  continuation,
  startError,
}: AnswerNotTakenNoticeProps) {
  const classes = useStyles();
  const agent = agentName || 'the same agent';

  let wayOut = newSessionElsewhereText(agent);
  if (newSessionBlocker) {
    wayOut = newSessionBlockedText(agent, newSessionBlocker);
  } else if (offersNewSession) {
    wayOut = `Start a new session with ${agent} from the message box below to carry on. ${describeStart(
      continuation,
      Boolean(answer),
    )}`;
  }

  return (
    <Alert
      status="danger"
      title="Could not resume this session"
      description={
        <span className={classes.description}>
          <span>
            kagent did not take your answer: the agent could not pick up where
            it stopped, so the question is still open and this session cannot
            continue. The transcript above is complete. {wayOut}
          </span>
          {answer && (
            <span className={classes.answer}>Your answer: {answer}</span>
          )}
          {startError && (
            <span>The new session could not be started: {startError}</span>
          )}
        </span>
      }
    />
  );
}
