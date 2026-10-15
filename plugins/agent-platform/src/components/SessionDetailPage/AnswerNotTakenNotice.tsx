import { Alert } from '@backstage/ui';
import { newSessionBlockedText, newSessionElsewhereText } from './helpers';

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
  /** Whether the person's answer was put in the message box below. */
  hasDraft: boolean;
  /** Why the last attempt to start the new session failed, when it did. */
  startError?: string;
};

/**
 * The words for an answer kagent did not take (`isAnswerNotTakenError`): the
 * agent could not resume, the question is still open, and sending the answer
 * again goes the same way. It takes the question card's place, so nothing on
 * the page invites a retry, and points at the new session the composer offers
 * under it, where the person's answer now waits as the draft.
 *
 * Danger, like a reported runtime loss: this session cannot go on. Unlike that
 * notice it names no cause, because kagent reports none; it says what the page
 * saw.
 */
export function AnswerNotTakenNotice({
  agentName,
  offersNewSession,
  newSessionBlocker,
  hasDraft,
  startError,
}: AnswerNotTakenNoticeProps) {
  const agent = agentName || 'the same agent';

  let wayOut = newSessionElsewhereText(agent);
  if (newSessionBlocker) {
    wayOut = newSessionBlockedText(agent, newSessionBlocker);
  } else if (offersNewSession && hasDraft) {
    wayOut = `Your answer is in the message box below. Start a new session with ${agent} from there to carry on; the answer goes with it.`;
  } else if (offersNewSession) {
    wayOut = `Start a new session with ${agent} from the message box below to carry on.`;
  }

  return (
    <Alert
      status="danger"
      title="Could not resume this session"
      description={
        <>
          kagent did not take your answer: the agent could not pick up where it
          stopped, so the question is still open and this session cannot
          continue. The transcript above is complete. {wayOut}
          {startError && (
            <> The new session could not be started: {startError}</>
          )}
        </>
      }
    />
  );
}
