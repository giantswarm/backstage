import { Alert } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { RuntimeLoss } from '@giantswarm/backstage-plugin-agent-platform-common';

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
}));

export type RuntimeLostNoticeProps = {
  loss: RuntimeLoss;
  /** The agent's display name, for the way out. Absent when no Agent matched. */
  agentName?: string;
  /**
   * Whether the composer below offers the new session — when it does, this
   * notice only explains; when it cannot (no addressable agent, a read-only
   * session), it has to say so itself.
   */
  offersNewSession: boolean;
  /**
   * Why no new session can start with the agent from this portal
   * (`AgentRow.sessionBlocker`): the way out names it instead of a button.
   */
  newSessionBlocker?: string;
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
 * again" costs nothing. A **reported** loss is final, and says so.
 */
export function RuntimeLostNotice({
  loss,
  agentName,
  offersNewSession,
  newSessionBlocker,
  startError,
}: RuntimeLostNoticeProps) {
  const classes = useStyles();
  const agent = agentName ? `${agentName}` : 'the same agent';

  const title = loss.reported
    ? 'This session cannot continue'
    : 'The agent’s runtime could not be brought back';

  const what = loss.reported
    ? `kagent marked this session’s runtime as lost: its working state was on a platform node that went away, likely while waiting for your answer. Nothing can restore it.`
    : `kagent could not restart the runtime holding this session’s state — its platform node likely went away (spot interruption, node roll) while the session waited for your answer.`;

  const attempts =
    !loss.reported && loss.attempts > 1
      ? ` It has failed ${loss.attempts} times in a row.`
      : '';

  let wayOut = `Continue in a new session with ${agent} from the Sessions list.`;
  if (newSessionBlocker) {
    wayOut = `A new session with ${agent} cannot be started from this portal: sessions start through agent-manager as you. ${newSessionBlocker}`;
  } else if (offersNewSession && loss.reported) {
    wayOut = `Start a new session with ${agent} to carry on — the button under the message box takes your message with it.`;
  } else if (offersNewSession) {
    wayOut = `Send again to retry. If it fails again, start a new session with ${agent} — the button under the message box takes your message with it.`;
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
          {loss.cause && (
            <span className={classes.cause}>kagent reported: {loss.cause}</span>
          )}
          {startError && (
            <span>The new session could not be started: {startError}</span>
          )}
        </span>
      }
    />
  );
}
