import { Alert } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import type { Continuation } from '../../../lib/continuationPrompt';
import {
  describeContinuationStart,
  newSessionBlockedText,
  newSessionElsewhereText,
} from '../helpers';

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
    wayOut = `To carry on with ${agent}, choose Continue in a new session under the message box. ${describeContinuationStart(
      { continuation, hasQuestion: true, hasAnswer: Boolean(answer) },
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
