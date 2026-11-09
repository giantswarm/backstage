import { Alert } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import type { Continuation } from '../../../lib/continuationPrompt';
import {
  ContinueInNewSessionButton,
  type NewSessionAction,
} from '../ContinueInNewSessionButton';
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
   * The new session this notice offers, under its text. Absent when none can
   * be offered (no addressable agent, a blocker): the notice then says where
   * else to go.
   */
  newSession?: NewSessionAction;
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

/** An unconfirmed answer stays visible until a session read confirms receipt. */
export function AnswerNotTakenNotice({
  agentName,
  newSession,
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
  } else if (newSession) {
    wayOut = `You can also continue in a new session with ${agent}. ${describeContinuationStart(
      { continuation, hasQuestion: true, hasAnswer: Boolean(answer) },
    )}`;
  }

  return (
    <Alert
      status="warning"
      title="Answer not yet confirmed"
      description={
        <span className={classes.description}>
          <span>
            The latest session read still showed an unanswered question. This
            notice will clear if the session confirms receipt. Refresh the
            session before sending the answer again. {wayOut}
          </span>
          {answer && (
            <span className={classes.answer}>Your answer: {answer}</span>
          )}
          {startError && (
            <span>The new session could not be started: {startError}</span>
          )}
          {newSession && !newSessionBlocker && (
            <ContinueInNewSessionButton {...newSession} variant="primary" />
          )}
        </span>
      }
    />
  );
}
