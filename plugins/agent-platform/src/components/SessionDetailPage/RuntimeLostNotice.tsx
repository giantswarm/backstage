import { Alert } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { RuntimeLoss } from '@giantswarm/backstage-plugin-agent-platform-common';
import type { Continuation } from '../../lib/continuationPrompt';
import {
  ContinueInNewSessionButton,
  type NewSessionAction,
} from './ContinueInNewSessionButton';
import {
  describeContinuationStart,
  newSessionBlockedText,
  newSessionElsewhereText,
} from './helpers';

const useStyles = makeStyles(theme => ({
  description: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
  },
  // The runtime's own words, set apart from the explanation: they are the
  // evidence, not the message.
  cause: {
    fontFamily: 'monospace',
    fontSize: '0.75rem',
    color: theme.palette.text.secondary,
    overflowWrap: 'anywhere',
  },
  // The person's own words, kept in sight and set apart from the explanation.
  answer: {
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  },
}));

export type RuntimeLostNoticeProps = {
  loss: RuntimeLoss;
  /** The agent's display name, for the way out. Absent when no Agent matched. */
  agentName?: string;
  /**
   * The new session this notice offers, under its text. Absent when none can
   * be offered (no addressable agent, a blocker, the agent still being read):
   * the notice then says where else to go.
   */
  newSession?: NewSessionAction;
  /**
   * Why no new session can start with the agent from this portal
   * (`AgentRow.sessionBlocker`): the way out names it instead of a button.
   */
  newSessionBlocker?: string;
  /** Whether the session is waiting on a question, which the new session gets. */
  hasQuestion?: boolean;
  /**
   * The answer to that question that the lost runtime never took, which the
   * new session's first message carries.
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
 * The words for a session whose runtime kagent cannot bring back.
 *
 * What the person needs to know, in this order: it is not their doing and not
 * a slow turn; the transcript is intact; there is a way on. The runtime's own
 * text — `actor "ai-…" request timed out` on gazelle — is shown as the
 * evidence beneath, never as the explanation: an actor name and "timed out"
 * told the person who read it nothing.
 *
 * Two registers. A **suspected** loss (the interim shape, before kagent marks
 * the instance) is worded as what the runtime did, with the retry still open —
 * a cold worker can produce the same timeout once, and "you can also send
 * again" costs nothing; the message box stays for it, and the new session is
 * the secondary way on. A **reported** loss is final, and says so: the page
 * shows no message box, and the new session is the one way on.
 *
 * A loss read from **sends that keep timing out** (`source: 'send-timeouts'`)
 * is the most tentative of all: kagent recorded nothing, and there are no
 * runtime words to show. It says what the person saw happen and that the
 * session may not be able to continue, with the retry as for any suspected
 * loss.
 */
export function RuntimeLostNotice({
  loss,
  agentName,
  newSession,
  newSessionBlocker,
  hasQuestion = false,
  answer,
  continuation,
  startError,
}: RuntimeLostNoticeProps) {
  const classes = useStyles();
  const agent = agentName ? `${agentName}` : 'the same agent';

  const fromSends = !loss.reported && loss.source === 'send-timeouts';

  let title = 'The agent’s runtime could not be brought back';
  let what = `kagent could not restart the runtime holding this session’s state — its platform node likely went away (spot interruption, node roll) while the session waited for your answer.`;
  if (loss.reported) {
    title = 'This session cannot continue';
    what = `kagent marked this session’s runtime as lost: its working state was on a platform node that went away, likely while waiting for your answer. Nothing can restore it.`;
  } else if (fromSends) {
    title = 'This session may not be able to continue';
    what = `${loss.attempts === 2 ? 'Neither' : 'None'} of your last ${loss.attempts} messages reached the agent: each timed out before it started. The session’s runtime may be failing to start.`;
  }

  const attempts =
    !loss.reported && !fromSends && loss.attempts > 1
      ? ` It has failed ${loss.attempts} times in a row.`
      : '';

  const start = describeContinuationStart({
    continuation,
    hasQuestion,
    hasAnswer: Boolean(answer),
  });
  let wayOut = newSessionElsewhereText(agent);
  if (newSessionBlocker) {
    wayOut = newSessionBlockedText(agent, newSessionBlocker);
  } else if (newSession && loss.reported) {
    wayOut = `To carry on, continue in a new session with ${agent}. ${start}`;
  } else if (newSession) {
    wayOut = `Send again to retry. If it fails again, continue in a new session with ${agent}. ${start}`;
  }

  return (
    <Alert
      status={loss.reported ? 'danger' : 'warning'}
      title={title}
      description={
        <span className={classes.description}>
          <span>
            {what}
            {attempts} The transcript above is complete. {wayOut}
          </span>
          {answer && (
            <span className={classes.answer}>Your answer: {answer}</span>
          )}
          {loss.cause && (
            <span className={classes.cause}>kagent reported: {loss.cause}</span>
          )}
          {startError && (
            <span>The new session could not be started: {startError}</span>
          )}
          {newSession && !newSessionBlocker && (
            <ContinueInNewSessionButton
              {...newSession}
              variant={loss.reported ? 'primary' : 'secondary'}
            />
          )}
        </span>
      }
    />
  );
}
