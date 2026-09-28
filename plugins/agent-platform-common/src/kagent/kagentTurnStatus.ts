import { readTokenUsage, TokenUsage } from './kagentParts';
import {
  AWAITING_INPUT_STATES,
  CANCELED_STATE,
  describeSessionState,
  FAILED_STATES,
} from './kagentSessionState';
import {
  A2aMessageWire,
  a2aMessageWireSchema,
  A2aTaskWire,
} from './kagentTaskSchema';

/**
 * A task's `status.message` in the states where it is not in `history`.
 *
 * On a turn that **ended** (failed, rejected, canceled) it is how the turn
 * ended; on one **awaiting input** it is the pending prompt. On a completed
 * task it is the reply, which history already holds, so it is not read here.
 */
export type TurnStatus = {
  /** The normalised state key. */
  state: string;
  /** Whether the turn ended, as opposed to waiting on the person. */
  ended: boolean;
  /**
   * `status.message` when it is an object. `status.message` is `z.unknown()` at
   * the parse boundary, and a bare string there (an `auth-required` hint, say)
   * is a shape nothing can render, not data loss.
   */
  raw?: object;
  /** `raw` parsed as a message, when it parses. */
  message?: A2aMessageWire;
};

export function readTurnStatus(task: A2aTaskWire): TurnStatus | undefined {
  const state = describeSessionState(task.status?.state)?.key;
  if (!state) {
    return undefined;
  }
  const ended = FAILED_STATES.has(state) || state === CANCELED_STATE;
  if (!ended && !AWAITING_INPUT_STATES.has(state)) {
    return undefined;
  }
  const value = task.status?.message;
  if (!value || typeof value !== 'object') {
    return { state, ended };
  }
  const parsed = a2aMessageWireSchema.safeParse(value);
  return {
    state,
    ended,
    raw: value,
    ...(parsed.success && { message: parsed.data }),
  };
}

/**
 * A task's history, plus the question it is currently waiting on.
 *
 * kagent puts an *unanswered* confirmation on `task.status.message` and **not** in
 * `history`. The raw `ask_user` call does appear in history, but it is skipped as
 * ADK plumbing (`INTERNAL_TOOL_NAMES`) because the approval path renders it, and
 * that path reads history. The pending `status.message` carries a distinct
 * `messageId` that appears nowhere in `history`, wrapping the question in the same
 * `adk_request_confirmation` shape an answered one has, so appending it as a final
 * entry gets the existing approval handling, and its usage, for free.
 *
 * Gated on the state rather than merely on the message being present: it is the
 * documented contract (`status.message` "carries the pending prompt while a task
 * waits for input"), and it makes the entry self-clearing. Once the task reaches
 * a terminal state the prompt stops being emitted here and the answered
 * confirmation is read from history instead.
 *
 * Only an object-shaped message is appended, see {@link TurnStatus.raw}.
 */
export function historyWithPendingPrompt(
  task: A2aTaskWire,
  status: TurnStatus | undefined = readTurnStatus(task),
): unknown[] {
  const history = Array.isArray(task.history) ? task.history : [];
  if (!status || status.ended || !status.raw) {
    return history;
  }
  return [...history, status.raw];
}

/**
 * The usage on an ended turn's status message, unless `seen` already holds its
 * id, and records the id in `seen` either way.
 *
 * That message is how the turn ended, not a reply, so `toWireTask` leaves it
 * off history. The claude Harness reports what a failed turn spent on it and
 * nowhere else. The id is recorded whether or not the message carries usage,
 * so a later task repeating it in history neither renders it again nor counts
 * it again.
 */
export function claimEndedTurnUsage(
  status: TurnStatus | undefined,
  seen: Set<string>,
): TokenUsage | undefined {
  const message = status?.ended ? status.message : undefined;
  if (!message) {
    return undefined;
  }
  const { messageId } = message;
  if (messageId) {
    if (seen.has(messageId)) {
      return undefined;
    }
    seen.add(messageId);
  }
  return message.role === 'user' ? undefined : readTokenUsage(message.metadata);
}
