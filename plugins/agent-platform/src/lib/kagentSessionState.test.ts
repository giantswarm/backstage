import {
  ACTIVE_MAX_AGE_MS,
  deriveSessionState,
  describeSessionState,
  isAgentWorking,
  readNewestTaskState,
} from './kagentSessionState';
import { normalizeTaskList } from './kagentSessionDetail';

import kagentPrefixed from './__fixtures__/tasks.v0-9-9.json';
import unknownState from './__fixtures__/tasks.unknown-state.json';
import emptyNoData from './__fixtures__/tasks.empty-no-data.json';

function stateFor(fixture: unknown) {
  return deriveSessionState(normalizeTaskList(fixture).tasks);
}

describe('describeSessionState', () => {
  it.each([
    ['working', 'Working', true],
    ['input-required', 'Waiting for input', true],
    ['completed', 'Completed', false],
    ['failed', 'Failed', false],
    ['canceled', 'Canceled', false],
  ])('describes %s', (raw, label, isActive) => {
    expect(describeSessionState(raw)).toMatchObject({ raw, label, isActive });
  });

  it('is case-insensitive about the state name', () => {
    expect(describeSessionState('COMPLETED')).toMatchObject({
      label: 'Completed',
      // The raw value is kept verbatim, so the original casing survives.
      raw: 'COMPLETED',
    });
  });

  it('renders an unknown state as itself, and treats it as inactive', () => {
    // Claiming a session is still running on the strength of a state we cannot
    // interpret would show a spinner that never resolves.
    expect(describeSessionState('quantum-superposition')).toEqual({
      raw: 'quantum-superposition',
      key: 'quantum-superposition',
      label: 'quantum-superposition',
      tone: 'neutral',
      isActive: false,
    });
  });

  it.each([undefined, ''])('returns undefined for %p', input => {
    expect(describeSessionState(input)).toBeUndefined();
  });

  it.each(['constructor', '__proto__'])(
    'renders %p verbatim instead of matching Object.prototype',
    state => {
      // A bare object index resolves inherited prototype members too. Of those,
      // only these two survive `toLowerCase()` unchanged — so only these two could
      // take the "known" branch and spread a function or the prototype, producing a
      // badge with an undefined label and tone.
      expect(describeSessionState(state)).toEqual({
        raw: state,
        key: state,
        label: state,
        tone: 'neutral',
        isActive: false,
      });
    },
  );
});

describe('deriveSessionState', () => {
  it('takes the state of the most recent task', () => {
    // kagent returns tasks ORDER BY created_at ASC, so the last one is newest.
    // An earlier turn having completed says nothing about whether the session is
    // working now.
    expect(stateFor(kagentPrefixed)).toMatchObject({
      raw: 'working',
      isActive: true,
    });
  });

  it('keeps an unrecognised newest state rather than falling back to an older one', () => {
    expect(stateFor(unknownState)).toMatchObject({
      raw: 'quantum-superposition',
      label: 'quantum-superposition',
    });
  });

  it('skips trailing tasks that report no state at all', () => {
    const tasks = normalizeTaskList(kagentPrefixed).tasks;
    const stateless = { ...tasks[tasks.length - 1], status: undefined };

    expect(deriveSessionState([...tasks, stateless])).toMatchObject({
      raw: 'working',
    });
  });

  it('returns undefined for a session with no tasks', () => {
    // A real condition — created but never run — and distinct from every state
    // kagent could report, so it must not be flattened into one of them.
    expect(stateFor(emptyNoData)).toBeUndefined();
    expect(deriveSessionState([])).toBeUndefined();
  });
});

describe('isAgentWorking', () => {
  const NOW = Date.parse('2026-08-31T12:00:00Z');

  /** One task, with a state and an age relative to `NOW`. */
  function task(state: string, options: { ageMs?: number } = {}) {
    const { ageMs = 0 } = options;
    return {
      status: {
        state,
        timestamp: new Date(NOW - ageMs).toISOString(),
      },
    };
  }

  function working(tasks: unknown[]) {
    return isAgentWorking(normalizeTaskList({ data: tasks }).tasks, NOW);
  }

  it('is true for a state that is active and moving', () => {
    expect(working([task('working')])).toBe(true);
    expect(working([task('submitted')])).toBe(true);
  });

  it('is false for every terminal state', () => {
    expect(working([task('completed')])).toBe(false);
    expect(working([task('failed')])).toBe(false);
    expect(working([task('canceled')])).toBe(false);
  });

  it('is false while the agent waits on a human, whatever the casing', () => {
    // `describeSessionState` matches case-insensitively but keeps `raw` verbatim,
    // so comparing against `raw` would miss here — and then a spinner would
    // promise progress that cannot arrive, and the composer would be offered on a
    // session a plain message strands.
    expect(working([task('Input-Required')])).toBe(false);
    expect(working([task('AUTH-REQUIRED')])).toBe(false);
  });

  it('is false while the agent waits on a human', () => {
    // Both are `isActive` — the session may still produce output — but nothing
    // moves until someone answers, so a spinner would promise progress that
    // cannot arrive on its own.
    expect(working([task('input-required')])).toBe(false);
    expect(working([task('auth-required')])).toBe(false);
  });

  it('expires once the state has not moved for the age bound', () => {
    // An agent that died mid-turn without writing a terminal state would
    // otherwise look busy for as long as the tab stays open.
    expect(
      working([task('working', { ageMs: ACTIVE_MAX_AGE_MS - 1_000 })]),
    ).toBe(true);
    expect(
      working([task('working', { ageMs: ACTIVE_MAX_AGE_MS + 1_000 })]),
    ).toBe(false);
  });

  it('reads the newest task, not the whole session', () => {
    expect(
      working([task('completed', { ageMs: 60_000 }), task('working')]),
    ).toBe(true);
    expect(
      working([task('working', { ageMs: 60_000 }), task('completed')]),
    ).toBe(false);
  });

  it('keeps working when nothing carries a usable time', () => {
    // There is nothing to measure against, and never showing progress for a
    // kagent that omits `timestamp` is the worse of the two failures.
    expect(working([{ status: { state: 'working' } }])).toBe(true);
  });

  it('falls back to the conversation’s newest time when the newest task has none', () => {
    // The state and the timestamp then come from different tasks, deliberately:
    // treating a missing timestamp as just-changed would make the bound unbounded.
    const stale = task('completed', { ageMs: ACTIVE_MAX_AGE_MS + 1_000 });
    expect(working([stale, { status: { state: 'working' } }])).toBe(false);
  });

  it('is false for a session with no tasks', () => {
    expect(working([])).toBe(false);
  });
});

describe('readNewestTaskState', () => {
  it('takes the state and its timestamp from the same task', () => {
    // A trailing task carrying no state must not lend its timestamp to an
    // earlier task's state.
    const tasks = normalizeTaskList({
      data: [
        { status: { state: 'working', timestamp: '2026-08-31T11:00:00Z' } },
        { status: { timestamp: '2026-08-31T11:59:00Z' } },
      ],
    }).tasks;

    expect(readNewestTaskState(tasks)).toEqual({
      state: expect.objectContaining({ raw: 'working' }),
      changedAt: Date.parse('2026-08-31T11:00:00Z'),
    });
  });
});

describe('describeSessionState normalisation', () => {
  it('carries the normalised key beside the verbatim state', () => {
    // `raw` is for display, `key` is for comparing. Keeping both means a caller
    // cannot accidentally compare against the un-normalised one.
    expect(describeSessionState('Input-Required')).toMatchObject({
      raw: 'Input-Required',
      key: 'input-required',
      label: 'Waiting for input',
    });
  });

  it('carries a key for an unknown state too', () => {
    expect(describeSessionState('Quantum-Superposition')).toMatchObject({
      raw: 'Quantum-Superposition',
      key: 'quantum-superposition',
    });
  });
});
