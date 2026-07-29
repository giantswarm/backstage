import { A2aTaskWire } from './kagentTaskSchema';

/** Tone for the status badge; maps onto whatever the UI layer uses. */
export type SessionStateTone =
  'neutral' | 'info' | 'success' | 'warning' | 'danger';

export type SessionState = {
  /** The A2A state verbatim, so an unrecognised one is still visible. */
  raw: string;
  label: string;
  tone: SessionStateTone;
  /** True while the session may still produce output. */
  isActive: boolean;
};

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
  const known = KNOWN_STATES[state.toLowerCase()];
  if (known) {
    return { raw: state, ...known };
  }
  return { raw: state, label: state, tone: 'neutral', isActive: false };
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
  for (let index = tasks.length - 1; index >= 0; index -= 1) {
    const state = describeSessionState(tasks[index]?.status?.state);
    if (state) {
      return state;
    }
  }
  return undefined;
}
