import { a2aMessageWireSchema } from './kagentTaskSchema';
import type { A2aTaskWire } from './kagentTaskSchema';
import { readMessageText } from './kagentParts';
import type { KagentSession } from './kagentSessions';
import { describeSessionState, FAILED_STATES } from './kagentSessionState';

/**
 * A session whose **runtime** kagent cannot bring back.
 *
 * A session's transcript lives in kagent's database and survives anything; the
 * agent's working state — the harness process, its conversation memory, its
 * scratch disk — lives in a Substrate snapshot of the actor. A turn that ends by
 * asking the person something leaves that snapshot on the worker's *node*, and
 * when the node goes (a spot interruption, a consolidation, a roll) the snapshot
 * goes with it. The next message can no longer be delivered: kagent asks
 * Substrate to resume an actor whose only copy is gone, the resume fails, and
 * the turn is recorded failed with the runtime's words as its reason.
 *
 * Two shapes of that failure reach the portal, and both are read here so every
 * surface — the composer, the failed-turn entry, the list, the rail — agrees
 * on what it is looking at:
 *
 * - **Reported** ({@link RuntimeLoss.reported} `true`): kagent marks the
 *   `AgentInstance` with a `Failure` whose reason is {@link RUNTIME_LOST_REASON}
 *   once it knows the runtime is gone, and ends such a turn at once with an
 *   A2A error whose message starts with `runtime lost: <cause>`. Definitive:
 *   nothing on this session can continue, and kagent's delete skips the suspend
 *   it would otherwise attempt first.
 * - **Suspected** (`reported` `false`): the interim shape, from before kagent
 *   said so. The turn failed after the runtime's timeout — atenet's
 *   `actor "ai-…" request timed out`, the gateway's `failed to connect to
 *   AgentInstance runtime`, the scheduler's `no free workers available` — and
 *   nothing else distinguishes it from a slow turn. Read as a loss because the
 *   alternative is offering the same retry forever; the retry is still offered
 *   beside the way out, since a cold worker can produce the same text once.
 */
export type RuntimeLoss = {
  /** kagent marked the instance's runtime lost, rather than this reading the turn. */
  reported: boolean;
  /** The runtime's words, when there were any — never the whole explanation. */
  cause?: string;
  /**
   * How many turns in a row ended this way, newest first. `1` for the first
   * failure; a reported loss counts what the conversation shows too, and `0`
   * when it shows nothing yet (the instance was marked before any turn failed).
   */
  attempts: number;
};

/**
 * The `Failure.reason` kagent records on an `AgentInstance` whose runtime is
 * lost. Compared leniently — `RuntimeLost` and `runtime-lost` read the same —
 * because the field is a free string on the wire.
 */
export const RUNTIME_LOST_REASON = 'RUNTIME_LOST';

export function isRuntimeLostReason(reason: string | undefined): boolean {
  return (
    reason !== undefined &&
    reason.replace(/[^a-z]/gi, '').toUpperCase() ===
      RUNTIME_LOST_REASON.replace(/_/g, '')
  );
}

/**
 * The words a lost runtime produces, by layer:
 *
 * - kagent, once it names the cause: `runtime lost: …` (an A2A error message,
 *   or the failed task's reason);
 * - kagent's A2A gateway when the runtime cannot be dialled:
 *   `failed to connect to AgentInstance runtime`;
 * - atenet, the runtime's ingress, after its resume budget:
 *   `actor "ai-…" request timed out` (the text a person read on gazelle);
 * - Substrate's scheduler when the snapshot's node is gone — a locality miss
 *   reported as capacity: `no free workers available`;
 * - Substrate's control plane, once it names the node:
 *   `local snapshot … lost` / `node … is gone`.
 */
const RUNTIME_LOST_TEXTS: RegExp[] = [
  /\bruntime lost\b/i,
  /failed to connect to AgentInstance runtime/i,
  /\bactor\b[^\n]*\brequest timed out\b/i,
  /\bno free workers available\b/i,
  /\bResumeActor\b[^\n]*(timed out|failed)/i,
  /\blocal snapshot\b[^\n]*\b(lost|gone|missing)\b/i,
];

/**
 * Whether a failure's text is a lost runtime rather than an agent's own error.
 *
 * Deliberately a text match: on the interim shape nothing structured says so,
 * and a model provider's `404 model_not_found` or a tool's refusal must keep
 * rendering as the turn's own failure. False for `undefined` and for the empty
 * string.
 */
export function isRuntimeLostFailureText(text: string | undefined): boolean {
  if (!text) {
    return false;
  }
  return RUNTIME_LOST_TEXTS.some(pattern => pattern.test(text));
}

/** The reason a failed task carries, when it carries a readable one. */
function readFailedTaskReason(task: A2aTaskWire): string | undefined {
  const raw = task.status?.message;
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const message = a2aMessageWireSchema.safeParse(raw);
  return message.success ? readMessageText(message.data) : undefined;
}

/**
 * Whether one task is a turn that failed on the runtime, and with what words.
 * `undefined` for a turn that did not fail, or failed for its own reasons.
 */
export function readRuntimeLostTurn(
  task: A2aTaskWire,
): { cause: string } | undefined {
  const state = describeSessionState(task.status?.state)?.key;
  if (!state || !FAILED_STATES.has(state)) {
    return undefined;
  }
  const reason = readFailedTaskReason(task);
  return isRuntimeLostFailureText(reason) ? { cause: reason! } : undefined;
}

/**
 * The runtime loss the **conversation** shows, from its newest turn back.
 *
 * kagent returns tasks oldest first, so the walk starts at the end. The newest
 * task that reports a state decides — the same task the badge and the composer
 * read (`findNewestStatefulTaskIndex`), so a session cannot read as lost here
 * and as working there. A newest turn that failed on the runtime is a loss;
 * earlier consecutive ones raise `attempts`, which is what tells "the runtime
 * did not come back once" from "it has not come back for three tries". A
 * newest turn that did anything else — completed, is working, is waiting on the
 * person — is not a loss, whatever happened before it: the runtime evidently
 * came back.
 */
export function readConversationRuntimeLoss(
  tasks: A2aTaskWire[],
): RuntimeLoss | undefined {
  let attempts = 0;
  let cause: string | undefined;
  for (let index = tasks.length - 1; index >= 0; index -= 1) {
    const task = tasks[index];
    // A trailing task with no state at all says nothing either way.
    if (!describeSessionState(task?.status?.state)) {
      continue;
    }
    const lost = readRuntimeLostTurn(task);
    if (!lost) {
      break;
    }
    attempts += 1;
    cause ??= lost.cause;
  }
  if (attempts === 0) {
    return undefined;
  }
  return { reported: false, cause, attempts };
}

/**
 * The runtime loss kagent **reported** on the instance, when it did.
 *
 * Feature-detected off the `Failure` the instance carries: a kagent from
 * before the reason existed marks nothing, and this answers `undefined` for it
 * so the interim reading takes over. The failure's message is the cause, with
 * kagent's own `runtime lost: ` prefix dropped — the surfaces say that part in
 * their own words.
 */
export function readReportedRuntimeLoss(
  session: Pick<KagentSession, 'failure'>,
): RuntimeLoss | undefined {
  if (!isRuntimeLostReason(session.failure?.reason)) {
    return undefined;
  }
  const message = session.failure?.message?.trim();
  const cause = message
    ? message.replace(/^runtime lost:\s*/i, '') || undefined
    : undefined;
  return { reported: true, cause, attempts: 0 };
}

/**
 * What the session and its conversation together say about the runtime.
 *
 * The instance's word wins: once kagent has marked the runtime lost nothing in
 * the conversation can contradict it, and the conversation's count of failed
 * attempts is folded in for the wording. Without a mark, the conversation's
 * own reading stands — the interim shape — or nothing.
 */
export function readRuntimeLoss(
  session: Pick<KagentSession, 'failure'> | undefined,
  tasks: A2aTaskWire[] | undefined,
): RuntimeLoss | undefined {
  const fromConversation = tasks
    ? readConversationRuntimeLoss(tasks)
    : undefined;
  const reported = session ? readReportedRuntimeLoss(session) : undefined;
  if (reported) {
    return {
      reported: true,
      cause: reported.cause ?? fromConversation?.cause,
      attempts: fromConversation?.attempts ?? 0,
    };
  }
  return fromConversation;
}
