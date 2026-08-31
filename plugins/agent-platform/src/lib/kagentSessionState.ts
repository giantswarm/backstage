import { A2aTaskWire } from './kagentTaskSchema';
import { normalizeTimestamp } from './kagentSessions';

/** Tone for the status badge; maps onto whatever the UI layer uses. */
export type SessionStateTone =
  'neutral' | 'info' | 'success' | 'warning' | 'danger';

export type SessionState = {
  /**
   * The A2A state verbatim, so an unrecognised one is still visible.
   *
   * **For display only.** Comparing against it is a bug waiting to happen: the
   * lookup below is case-insensitive, so `raw` can be `'Input-Required'` while the
   * state resolved is `input-required`. Use {@link key}.
   */
  raw: string;
  /**
   * The normalised state, as matched against the known set — what to compare.
   *
   * Carried rather than left to callers to lower-case, because the two call sites
   * that need it decide whether to promise progress and whether to offer the
   * composer, and getting it wrong offers both on a session that is waiting for a
   * human.
   */
  key: string;
  label: string;
  tone: SessionStateTone;
  /** True while the session may still produce output. */
  isActive: boolean;
};

/**
 * The states in which a task is waiting on a human rather than working.
 *
 * Both are `isActive` — the session may still produce output — but they are the
 * opposite of "busy": nothing moves until someone answers. Two callers need to
 * tell them apart from `working`, and for different reasons: the timeline reads
 * the pending question off `status.message`, and the composer withholds itself,
 * because a plain message sent while a confirmation is outstanding opens a *new*
 * task and leaves the old one waiting forever.
 *
 * The legacy (v0) spellings, which is what this client reads: `listSessionTasks`
 * deliberately sends no `A2A-Version` header, and kagent treats a missing header
 * as the legacy wire.
 */
export const AWAITING_INPUT_STATES = new Set([
  'input-required',
  'auth-required',
]);

/**
 * The A2A task states kagent can report, as of a2a 0.3 / kagent v0.10.
 *
 * Deliberately a lookup rather than a `z.enum` at the parse boundary: a state we
 * have never seen must still render — as itself — instead of failing the page or
 * being coerced into a state we do know.
 */
const KNOWN_STATES: Record<
  string,
  { label: string; tone: SessionStateTone; isActive: boolean }
> = {
  submitted: { label: 'Submitted', tone: 'info', isActive: true },
  working: { label: 'Working', tone: 'info', isActive: true },
  'input-required': {
    label: 'Waiting for input',
    tone: 'warning',
    isActive: true,
  },
  'auth-required': {
    label: 'Authentication required',
    tone: 'warning',
    isActive: true,
  },
  completed: { label: 'Completed', tone: 'success', isActive: false },
  failed: { label: 'Failed', tone: 'danger', isActive: false },
  canceled: { label: 'Canceled', tone: 'neutral', isActive: false },
  rejected: { label: 'Rejected', tone: 'danger', isActive: false },
  unknown: { label: 'Unknown', tone: 'neutral', isActive: false },
};

/**
 * Describe one A2A task state.
 *
 * An unknown value keeps its raw form as the label and is treated as **not
 * active**: claiming a session is still running on the strength of a state we
 * cannot interpret would show a spinner that never resolves.
 */
export function describeSessionState(
  state: string | undefined,
): SessionState | undefined {
  if (!state) {
    return undefined;
  }
  // `hasOwnProperty`, not a bare lookup: a plain-object index also resolves
  // inherited `Object.prototype` members. Of those, `constructor` and `__proto__`
  // survive `toLowerCase()` unchanged, so a state of either would take the
  // "known" branch and spread a function or the prototype — yielding a badge with
  // an undefined label and tone instead of rendering the state verbatim. This
  // module exists to tolerate whatever kagent puts on the wire, so it shouldn't
  // have a hole shaped like two specific strings.
  const key = state.toLowerCase();
  const known = Object.prototype.hasOwnProperty.call(KNOWN_STATES, key)
    ? KNOWN_STATES[key]
    : undefined;
  if (known) {
    return { raw: state, key, ...known };
  }
  return { raw: state, key, label: state, tone: 'neutral', isActive: false };
}

/**
 * The session's state, taken from its **most recent** task.
 *
 * kagent returns tasks `ORDER BY created_at ASC`
 * (`go/core/internal/database/gen/tasks.sql.go`), so the array is chronological
 * and the last element is the newest turn. Its state is the session's state:
 * earlier turns having completed says nothing about whether the session is
 * currently working.
 *
 * Returns `undefined` when there are no tasks or none reported a state — a
 * session created but never run. That is a real condition ("no activity yet"),
 * distinct from any state kagent could report, so it must not be flattened into
 * one of them.
 */
export function deriveSessionState(
  tasks: A2aTaskWire[],
): SessionState | undefined {
  return readNewestTaskState(tasks)?.state;
}

/**
 * How long a session's newest task may sit in an active state before we stop
 * treating it as live.
 *
 * Without a bound, an agent that died mid-turn without writing a terminal state
 * would look busy for as long as anyone leaves the tab open. Same purpose as
 * `TRANSITIONAL_MAX_AGE_MS` for agents, calibrated differently: the agents' 3
 * minutes tracks a controller reconcile loop, while this tracks an agent *turn*,
 * which routinely runs minutes when there are many tool calls. A 3-minute bound
 * would give up in the middle of exactly the run the page was opened to watch.
 *
 * Two things measure against it, and it lives here so they cannot drift apart:
 * the conversation's poll tier (`getSessionTasksRefetchInterval`) and the
 * "Working…" indicator ({@link isAgentWorking}).
 */
export const ACTIVE_MAX_AGE_MS = 5 * 60_000;

/** The newest task that reports a state, with the age basis for that state. */
export type NewestTaskState = {
  state: SessionState;
  /** Epoch ms the state last moved, when anything usable says. */
  changedAt?: number;
};

/**
 * The most recent usable `status.timestamp` anywhere in the conversation.
 *
 * The age basis of last resort. `timestamp` is optional at the parse boundary, and
 * `normalizeTimestamp` also rejects Go zero time and anything unparseable — so the
 * newest task can perfectly well carry no usable time of its own, which would
 * otherwise leave {@link ACTIVE_MAX_AGE_MS} with nothing to measure against.
 */
function newestUsableTimestamp(tasks: A2aTaskWire[]): number | undefined {
  // Compared as parsed instants, not as strings: kagent's timestamps are UTC ISO
  // today, but string order stops matching time order the moment a value arrives
  // with an offset or a different fractional precision.
  let newest: number | undefined;
  for (const task of tasks) {
    const at = normalizeTimestamp(task?.status?.timestamp);
    if (at === undefined) {
      continue;
    }
    const parsed = Date.parse(at);
    if (newest === undefined || parsed > newest) {
      newest = parsed;
    }
  }
  return newest;
}

/**
 * Walk back to the newest task that reports a state, and resolve when it moved.
 *
 * kagent returns tasks oldest-first, so the session's state is the newest task's.
 * The walk takes the state **and** the timestamp from the same task, so a trailing
 * task carrying no state cannot lend its timestamp to an earlier task's state.
 *
 * When that task has no usable timestamp of its own, the conversation's newest
 * usable one stands in — losing the "same task" property deliberately. A missing
 * timestamp cannot be treated as just-changed the way `isAgentConverging` can for a
 * Kubernetes object, which always carries `lastTransitionTime`: here it is genuinely
 * optional, so assuming freshness would make the age bound *unbounded* on the one
 * path where it matters most — an agent that died mid-turn, or a kagent that stops
 * emitting the field. `changedAt` stays undefined only when nothing in the whole
 * conversation carries a usable time.
 */
export function readNewestTaskState(
  tasks: A2aTaskWire[],
): NewestTaskState | undefined {
  const index = findNewestStatefulTaskIndex(tasks);
  if (index === undefined) {
    return undefined;
  }

  const status = tasks[index]?.status;
  const state = describeSessionState(status?.state);
  if (!state) {
    return undefined;
  }

  const own = normalizeTimestamp(status?.timestamp);
  const changedAt =
    own === undefined ? newestUsableTimestamp(tasks) : Date.parse(own);

  return { state, changedAt };
}

/**
 * Index of the task whose state **is** the session's state.
 *
 * The newest task that reports a state at all, skipping any trailing task that
 * carries none. Exported so that everything deciding "what is this session doing
 * right now" reads the same task: the state badge, the working indicator and
 * `readPendingConfirmation` disagreeing about which turn is current is not a
 * cosmetic bug. It cost us one — the answer panel offered to answer an older
 * stranded question while the newest task had already completed, because it looked
 * for the newest *awaiting* task rather than the newest one full stop.
 */
export function findNewestStatefulTaskIndex(
  tasks: A2aTaskWire[],
): number | undefined {
  for (let index = tasks.length - 1; index >= 0; index -= 1) {
    if (describeSessionState(tasks[index]?.status?.state)) {
      return index;
    }
  }
  return undefined;
}

/**
 * Whether the agent is working on a reply *right now*.
 *
 * Three conditions, each excluding a different way "unfinished" fails to mean
 * "working":
 *
 * - the newest task is in an active state — it might still produce output;
 * - that state is not one of {@link AWAITING_INPUT_STATES}, where the agent is
 *   blocked on a human and no progress can arrive on its own;
 * - the state has moved inside {@link ACTIVE_MAX_AGE_MS}, so a turn that died
 *   without writing a terminal state stops being reported as live.
 *
 * A state with no usable timestamp anywhere counts as working: there is nothing to
 * measure, and the alternative — never showing progress for a kagent that omits the
 * field — is the worse failure of the two.
 *
 * `now` is passed in rather than read here so callers can tie the judgement to the
 * freshness of the data it is made from.
 */
export function isAgentWorking(tasks: A2aTaskWire[], now: number): boolean {
  const newest = readNewestTaskState(tasks);
  if (!newest?.state.isActive) {
    return false;
  }
  if (AWAITING_INPUT_STATES.has(newest.state.key)) {
    return false;
  }
  if (newest.changedAt === undefined) {
    return true;
  }
  return now - newest.changedAt < ACTIVE_MAX_AGE_MS;
}
