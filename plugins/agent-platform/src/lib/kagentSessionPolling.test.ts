import type { A2aTaskWire } from './kagentTaskSchema';
import { deriveSessionState } from './kagentSessionState';
import {
  ACTIVE_MAX_AGE_MS,
  ACTIVE_REFETCH_INTERVAL_MS,
  BASELINE_REFETCH_INTERVAL_MS,
  getSessionTasksRefetchInterval,
} from './kagentSessionPolling';

describe('getSessionTasksRefetchInterval', () => {
  const BASELINE = BASELINE_REFETCH_INTERVAL_MS;
  const FAST = ACTIVE_REFETCH_INTERVAL_MS;
  const NOW = Date.parse('2026-07-31T12:00:00Z');

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /** A query whose data is the session's task list, oldest first. */
  function query(tasks: A2aTaskWire[] | undefined) {
    return { state: { data: tasks } } as Parameters<
      typeof getSessionTasksRefetchInterval
    >[0];
  }

  function task(
    state: string | undefined,
    { ageMs = 0, timestamp }: { ageMs?: number; timestamp?: string } = {},
  ): A2aTaskWire {
    return {
      id: `task-${state ?? 'none'}-${ageMs}`,
      contextId: 'abc',
      kind: 'task',
      status: {
        state,
        timestamp: timestamp ?? new Date(NOW - ageMs).toISOString(),
      },
    } as unknown as A2aTaskWire;
  }

  it('uses the baseline before the first fetch resolves', () => {
    expect(getSessionTasksRefetchInterval(query(undefined))).toBe(BASELINE);
  });

  it('uses the baseline for a session with no tasks', () => {
    // Created but never run — there is nothing converging to watch.
    expect(getSessionTasksRefetchInterval(query([]))).toBe(BASELINE);
  });

  it.each(['working', 'submitted'])(
    'polls fast while the newest task is %s',
    state => {
      expect(getSessionTasksRefetchInterval(query([task(state)]))).toBe(FAST);
    },
  );

  it.each(['completed', 'failed', 'canceled', 'rejected'])(
    'uses the baseline once the newest task is %s',
    state => {
      expect(getSessionTasksRefetchInterval(query([task(state)]))).toBe(
        BASELINE,
      );
    },
  );

  it('decides from the newest task, not from any earlier one', () => {
    // An earlier turn having been `working` says nothing about now — the same rule
    // `deriveSessionState` applies.
    const tasks = [task('working', { ageMs: 60_000 }), task('completed')];

    expect(getSessionTasksRefetchInterval(query(tasks))).toBe(BASELINE);
  });

  it('uses the baseline for a state we do not recognise', () => {
    // Matches `describeSessionState`: claiming a session is live on the strength of
    // a state we cannot interpret would poll fast forever.
    expect(getSessionTasksRefetchInterval(query([task('teleporting')]))).toBe(
      BASELINE,
    );
  });

  it('still polls fast just inside the active window', () => {
    const recent = task('working', { ageMs: ACTIVE_MAX_AGE_MS - 1_000 });

    expect(getSessionTasksRefetchInterval(query([recent]))).toBe(FAST);
  });

  // The bound that stops an agent which died mid-turn — no terminal state ever
  // written — from pinning the fast tier for as long as the tab stays open.
  it('backs off to the baseline for a task stuck working', () => {
    const stuck = task('working', { ageMs: 10 * 60_000 });

    expect(getSessionTasksRefetchInterval(query([stuck]))).toBe(BASELINE);
  });

  // `input-required` and `auth-required` are active but wait on a human, and this
  // page offers no way to answer. The age bound is what keeps them from polling
  // 500 KB forever; a reply elsewhere moves the timestamp and re-engages the fast
  // tier on its own.
  it.each(['input-required', 'auth-required'])(
    'polls %s fast while fresh and backs off once nobody answers',
    state => {
      expect(getSessionTasksRefetchInterval(query([task(state)]))).toBe(FAST);
      expect(
        getSessionTasksRefetchInterval(
          query([task(state, { ageMs: 10 * 60_000 })]),
        ),
      ).toBe(BASELINE);
    },
  );

  it.each([
    ['no timestamp at all', undefined],
    ['Go zero time', '0001-01-01T00:00:00Z'],
    ['an unparseable timestamp', 'not-a-date'],
  ])('polls fast when an active task has %s', (_label, timestamp) => {
    // Treated as just-changed rather than as stuck, mirroring `isAgentConverging`.
    const noAge = task('working', { timestamp });

    expect(getSessionTasksRefetchInterval(query([noAge]))).toBe(FAST);
  });

  it('reads the state and its timestamp from the same task', () => {
    // A trailing task with no state is skipped entirely: its (fresh) timestamp
    // must not make the earlier, stale `working` task look like it just moved.
    const stuck = task('working', { ageMs: 10 * 60_000 });
    const stateless = task(undefined, { ageMs: 0 });

    expect(getSessionTasksRefetchInterval(query([stuck, stateless]))).toBe(
      BASELINE,
    );
  });

  it('agrees with deriveSessionState about which task decides', () => {
    // The backwards walk is duplicated here rather than shared, so this guards the
    // two copies against drifting apart.
    const tasks = [task('completed', { ageMs: 60_000 }), task('working')];

    expect(deriveSessionState(tasks)?.raw).toBe('working');
    expect(getSessionTasksRefetchInterval(query(tasks))).toBe(FAST);
  });
});
