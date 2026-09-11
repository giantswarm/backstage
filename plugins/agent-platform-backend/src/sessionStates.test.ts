import { mockServices } from '@backstage/backend-test-utils';
import { NotFoundError } from '@backstage/errors';
import { KagentClient } from './KagentClient';
import { SessionStateReader } from './sessionStates';

const NOW = Date.parse('2026-09-04T12:00:00.000Z');

/** A wire session as `GET /api/sessions` returns it. */
function wireSession(
  id: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    name: `session ${id}`,
    user_id: 'marian@giantswarm.io',
    created_at: '2026-09-01T10:00:00Z',
    updated_at: '2026-09-04T11:59:00Z',
    ...overrides,
  };
}

/** A task list envelope whose single task reports `state`. */
function wireTasks(state: string | undefined, timestamp?: string) {
  return {
    error: false,
    data: [
      {
        id: 't1',
        contextId: 'c1',
        status: {
          ...(state === undefined ? {} : { state }),
          ...(timestamp === undefined ? {} : { timestamp }),
        },
        history: [],
      },
    ],
  };
}

describe('SessionStateReader', () => {
  const listSessions = jest.fn();
  const listSessionTasks = jest.fn();
  const client = { listSessions, listSessionTasks } as unknown as KagentClient;
  const logger = mockServices.logger.mock();

  function reader(options = {}, now: () => number = () => NOW) {
    return new SessionStateReader(client, logger, 'gazelle', options, now);
  }

  beforeEach(() => {
    listSessions.mockReset();
    listSessionTasks.mockReset();
  });

  it('reports the newest task state per session', async () => {
    listSessions.mockResolvedValue({
      error: false,
      data: [wireSession('a'), wireSession('b')],
    });
    listSessionTasks.mockImplementation(async (id: string) =>
      id === 'a'
        ? wireTasks('input-required', '2026-09-04T11:00:00Z')
        : wireTasks('completed', '2026-09-04T10:00:00Z'),
    );

    const result = await reader().read('tok');

    expect(result.states).toEqual([
      expect.objectContaining({
        sessionId: 'a',
        state: 'input-required',
        changedAt: Date.parse('2026-09-04T11:00:00Z'),
      }),
      expect.objectContaining({ sessionId: 'b', state: 'completed' }),
    ]);
    expect(result.unreadable).toEqual([]);
    expect(result.skipped).toBe(0);
    expect(result.evaluatedAt).toBe(NOW);
  });

  it('reports a session that has never run as null, not as terminal', async () => {
    // Three different facts the rail renders differently: no state, not
    // evaluated, and unreadable. Flattening any pair loses information.
    listSessions.mockResolvedValue({ error: false, data: [wireSession('a')] });
    listSessionTasks.mockResolvedValue(wireTasks(undefined));

    const result = await reader().read('tok');

    expect(result.states).toEqual([{ sessionId: 'a', state: null }]);
  });

  it('never reads tasks for an A2A subagent session', async () => {
    listSessions.mockResolvedValue({
      error: false,
      data: [wireSession('parent'), wireSession('child', { source: 'agent' })],
    });
    listSessionTasks.mockResolvedValue(wireTasks('completed'));

    const result = await reader().read('tok');

    expect(listSessionTasks).toHaveBeenCalledTimes(1);
    expect(listSessionTasks).toHaveBeenCalledWith(
      'parent',
      expect.anything(),
      expect.anything(),
    );
    expect(result.states.map(s => s.sessionId)).toEqual(['parent']);
    // Excluded before selection, so it is not "skipped" either — it is not a
    // session the rail has any business counting.
    expect(result.skipped).toBe(0);
  });

  it('counts sessions past the cap as skipped', async () => {
    listSessions.mockResolvedValue({
      error: false,
      data: Array.from({ length: 5 }, (_, i) => wireSession(`s${i}`)),
    });
    listSessionTasks.mockResolvedValue(wireTasks('completed'));

    const result = await reader({ maxSessions: 2 }).read('tok');

    expect(result.states).toHaveLength(2);
    expect(result.skipped).toBe(3);
    expect(listSessionTasks).toHaveBeenCalledTimes(2);
  });

  it('keeps one failed task read from costing the whole summary', async () => {
    listSessions.mockResolvedValue({
      error: false,
      data: [wireSession('ok'), wireSession('gone'), wireSession('ok2')],
    });
    listSessionTasks.mockImplementation(async (id: string) => {
      if (id === 'gone') {
        throw new NotFoundError('deleted between the list and the read');
      }
      return wireTasks('completed');
    });

    const result = await reader().read('tok');

    expect(result.states.map(s => s.sessionId).sort()).toEqual(['ok', 'ok2']);
    expect(result.unreadable).toEqual(['gone']);
  });

  it('resolves even when every task read fails', async () => {
    listSessions.mockResolvedValue({
      error: false,
      data: [wireSession('a'), wireSession('b')],
    });
    listSessionTasks.mockRejectedValue(new Error('kagent is having a moment'));

    const result = await reader().read('tok');

    expect(result.states).toEqual([]);
    expect(result.unreadable.sort()).toEqual(['a', 'b']);
  });

  it('logs partial failure at debug, as a count, without session ids', async () => {
    // The root logger forwards warn and error to Sentry, and a partial read is
    // the expected outcome this route is built around.
    listSessions.mockResolvedValue({ error: false, data: [wireSession('a')] });
    listSessionTasks.mockRejectedValue(new Error('nope'));

    await reader().read('tok');

    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('task reads failed'),
      { failed: 1, evaluated: 1 },
    );
  });

  it('never exceeds the configured concurrency', async () => {
    listSessions.mockResolvedValue({
      error: false,
      data: Array.from({ length: 10 }, (_, i) => wireSession(`s${i}`)),
    });
    let inFlight = 0;
    let peak = 0;
    listSessionTasks.mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise(resolve => setTimeout(resolve, 1));
      inFlight -= 1;
      return wireTasks('completed');
    });

    await reader({ concurrency: 3 }).read('tok');

    expect(peak).toBe(3);
    expect(listSessionTasks).toHaveBeenCalledTimes(10);
  });

  it('gives each task read the short per-read timeout', async () => {
    listSessions.mockResolvedValue({ error: false, data: [wireSession('a')] });
    listSessionTasks.mockResolvedValue(wireTasks('completed'));

    await reader({ taskTimeoutMs: 1234 }).read('tok');

    expect(listSessionTasks).toHaveBeenCalledWith(
      'a',
      { userToken: 'tok' },
      // Status only: the newest task's state is all the rail needs.
      { timeoutMs: 1234, historyLength: 0, includeArtifacts: false },
    );
  });

  it('stops at the budget and reports the remainder as skipped', async () => {
    listSessions.mockResolvedValue({
      error: false,
      data: Array.from({ length: 6 }, (_, i) => wireSession(`s${i}`)),
    });
    // Clock advances a second per call, so the 2s budget admits two reads.
    let clock = NOW;
    listSessionTasks.mockImplementation(async () => {
      clock += 1_000;
      return wireTasks('completed');
    });

    const result = await reader(
      { budgetMs: 2_000, concurrency: 1 },
      () => clock,
    ).read('tok');

    expect(result.states.length).toBeLessThan(6);
    expect(result.states.length + result.skipped).toBe(6);
    expect(result.skipped).toBeGreaterThan(0);
  });

  describe('caching', () => {
    it('reuses a summary inside the TTL and recomputes after it', async () => {
      listSessions.mockResolvedValue({
        error: false,
        data: [wireSession('a')],
      });
      listSessionTasks.mockResolvedValue(wireTasks('completed'));
      let clock = NOW;
      const subject = reader({ cacheTtlMs: 15_000 }, () => clock);

      await subject.read('tok');
      clock += 10_000;
      await subject.read('tok');
      expect(listSessions).toHaveBeenCalledTimes(1);

      clock += 10_000;
      await subject.read('tok');
      expect(listSessions).toHaveBeenCalledTimes(2);
    });

    it('never serves one token’s summary to another', async () => {
      // The cache key is the token, because kagent scopes its list by that
      // token's subject. Sharing an entry would hand one person another's
      // sessions.
      listSessions.mockResolvedValue({
        error: false,
        data: [wireSession('a')],
      });
      listSessionTasks.mockResolvedValue(wireTasks('completed'));
      const subject = reader();

      await subject.read('token-one');
      await subject.read('token-two');

      expect(listSessions).toHaveBeenCalledTimes(2);
    });

    it('collapses concurrent passes into one fan-out', async () => {
      listSessions.mockResolvedValue({
        error: false,
        data: [wireSession('a')],
      });
      listSessionTasks.mockResolvedValue(wireTasks('completed'));
      const subject = reader();

      await Promise.all([subject.read('tok'), subject.read('tok')]);

      expect(listSessions).toHaveBeenCalledTimes(1);
    });

    it('does not cache a failed pass', async () => {
      listSessions
        .mockRejectedValueOnce(new Error('kagent unreachable'))
        .mockResolvedValue({ error: false, data: [] });
      const subject = reader();

      await expect(subject.read('tok')).rejects.toThrow('kagent unreachable');
      await expect(subject.read('tok')).resolves.toEqual(
        expect.objectContaining({ states: [] }),
      );
    });
  });
});

describe('SessionStateReader — bounds that must hold', () => {
  const listSessions = jest.fn();
  const listSessionTasks = jest.fn();
  const client = { listSessions, listSessionTasks } as unknown as KagentClient;
  const logger = mockServices.logger.mock();

  function reader(options = {}, now: () => number = () => NOW) {
    return new SessionStateReader(client, logger, 'gazelle', options, now);
  }

  beforeEach(() => {
    listSessions.mockReset();
    listSessionTasks.mockReset();
  });

  it('clamps a read to what is left of the pass, not the flat timeout', async () => {
    // Otherwise `budgetMs` bounds dispatch rather than response: a read
    // starting just inside the budget would still wait the full
    // `taskTimeoutMs`, holding the request past the frontend's 10s poll.
    listSessions.mockResolvedValue({ error: false, data: [wireSession('a')] });
    listSessionTasks.mockResolvedValue(wireTasks('completed'));
    const clock = NOW;

    await reader(
      { budgetMs: 2_000, taskTimeoutMs: 5_000, concurrency: 1 },
      () => clock,
    ).read('tok');

    // 2s of budget remained, so the read may not be given the 5s default.
    expect(listSessionTasks).toHaveBeenCalledWith(
      'a',
      expect.anything(),
      expect.objectContaining({ timeoutMs: 2_000 }),
    );
  });

  it('keeps the flat timeout while there is budget to spare', async () => {
    listSessions.mockResolvedValue({ error: false, data: [wireSession('a')] });
    listSessionTasks.mockResolvedValue(wireTasks('completed'));

    await reader({ budgetMs: 8_000, taskTimeoutMs: 5_000 }).read('tok');

    expect(listSessionTasks).toHaveBeenCalledWith(
      'a',
      expect.anything(),
      expect.objectContaining({ timeoutMs: 5_000 }),
    );
  });

  it('a slow failing pass does not evict the healthy entry that replaced it', async () => {
    // Pass A is slow and fails; by the time it rejects its entry has expired
    // and pass B has installed a valid one. Deleting unconditionally would
    // throw B away and send every later poll into another fan-out.
    let clock = NOW;
    let failSlowly: (reason: Error) => void = () => {};
    listSessions
      .mockImplementationOnce(
        () => new Promise((_, reject) => (failSlowly = reject)),
      )
      .mockResolvedValue({ error: false, data: [wireSession('a')] });
    listSessionTasks.mockResolvedValue(wireTasks('working'));

    const subject = reader({ cacheTtlMs: 15_000 }, () => clock);

    const slow = subject.read('tok');
    const slowSettled = slow.catch(() => 'rejected');

    // A's entry expires, so a later request installs and resolves its own.
    clock += 20_000;
    const healthy = await subject.read('tok');
    expect(healthy.states).toHaveLength(1);

    // Now A finally fails.
    failSlowly(new Error('kagent went away'));
    expect(await slowSettled).toBe('rejected');

    // B must still be cached: another read inside its TTL does no more work.
    const callsBefore = listSessions.mock.calls.length;
    const again = await subject.read('tok');
    expect(again.states).toHaveLength(1);
    expect(listSessions.mock.calls.length).toBe(callsBefore);
  });

  it.each([
    ['concurrency', { concurrency: 0 }],
    ['maxSessions', { maxSessions: 0 }],
    ['budgetMs', { budgetMs: 0 }],
  ])(
    'floors a configured %s of 0 rather than disabling the route',
    async (_label, options) => {
      // `??` only substitutes for undefined, so a configured 0 arrives intact.
      // Left alone it answers 200 with no states and everything skipped — which
      // the rail cannot distinguish from a healthy idle fleet without the
      // `skipped` count it now reads.
      listSessions.mockResolvedValue({
        error: false,
        data: [wireSession('a')],
      });
      listSessionTasks.mockResolvedValue(wireTasks('working'));

      const result = await reader(options).read('tok');

      expect(listSessionTasks).toHaveBeenCalled();
      expect(result.states).toEqual([
        expect.objectContaining({ sessionId: 'a', state: 'working' }),
      ]);
      expect(result.skipped).toBe(0);
    },
  );

  it('still honours a deliberate zero cache TTL', async () => {
    // Unlike the others, 0 is meaningful here: it means "do not cache".
    listSessions.mockResolvedValue({ error: false, data: [] });
    const subject = reader({ cacheTtlMs: 0 });

    await subject.read('tok');
    await subject.read('tok');

    expect(listSessions).toHaveBeenCalledTimes(2);
  });
});

describe('SessionStateReader — what counts as a shortfall', () => {
  const listSessions = jest.fn();
  const listSessionTasks = jest.fn();
  const client = { listSessions, listSessionTasks } as unknown as KagentClient;
  const logger = mockServices.logger.mock();

  function reader(options = {}, now: () => number = () => NOW) {
    return new SessionStateReader(client, logger, 'gazelle', options, now);
  }

  beforeEach(() => {
    listSessions.mockReset();
    listSessionTasks.mockReset();
  });

  it('does not count a session outside the activity window as skipped', async () => {
    // The gap that let the regression through: `skipped` is what the UI reads as
    // "we could not tell". The window is a deliberate scope decision, and any
    // account more than a week old holds such a session — so counting it would
    // make the rail permanently claim uncertainty, with a retry that recomputes
    // the same answer for ever.
    listSessions.mockResolvedValue({
      error: false,
      data: [
        wireSession('recent', { updated_at: '2026-09-04T11:00:00Z' }),
        wireSession('ancient', { updated_at: '2026-07-01T10:00:00Z' }),
      ],
    });
    listSessionTasks.mockResolvedValue(wireTasks('completed'));

    const result = await reader().read('tok');

    expect(listSessionTasks).toHaveBeenCalledTimes(1);
    expect(result.states.map(state => state.sessionId)).toEqual(['recent']);
    expect(result.skipped).toBe(0);
  });

  it('still counts sessions past the cap as skipped', async () => {
    listSessions.mockResolvedValue({
      error: false,
      data: Array.from({ length: 5 }, (_, i) => wireSession(`s${i}`)),
    });
    listSessionTasks.mockResolvedValue(wireTasks('completed'));

    const result = await reader({ maxSessions: 2 }).read('tok');

    expect(result.skipped).toBe(3);
  });

  it('separates the two even when both apply', async () => {
    listSessions.mockResolvedValue({
      error: false,
      data: [
        ...Array.from({ length: 4 }, (_, i) =>
          wireSession(`fresh${i}`, { updated_at: '2026-09-04T11:00:00Z' }),
        ),
        wireSession('ancient', { updated_at: '2026-07-01T10:00:00Z' }),
      ],
    });
    listSessionTasks.mockResolvedValue(wireTasks('completed'));

    const result = await reader({ maxSessions: 2 }).read('tok');

    // 4 in window, cap 2 → 2 past the cap. The out-of-window one is not counted.
    expect(result.skipped).toBe(2);
  });

  it('attributes a budget cutoff to skipped, not to unreadable', async () => {
    // A read dispatched with a sliver of budget left would time out and be
    // reported as a fault the operator can act on, when the truth is that the
    // pass ran out of time.
    listSessions.mockResolvedValue({
      error: false,
      data: [wireSession('a'), wireSession('b')],
    });
    let clock = NOW;
    listSessionTasks.mockImplementation(async () => {
      // Leave only a sliver after the first read.
      clock += 1_900;
      return wireTasks('completed');
    });

    const result = await reader(
      { budgetMs: 2_000, concurrency: 1 },
      () => clock,
    ).read('tok');

    expect(result.states).toHaveLength(1);
    expect(result.unreadable).toEqual([]);
    expect(result.skipped).toBe(1);
  });

  describe('on the kagent API v2 line', () => {
    /** An AgentInstance as `ListAgentInstances` answers it. */
    function instance(id: string, overrides: Record<string, unknown> = {}) {
      return {
        id,
        creator: 'dev@lab.local',
        harness: { namespace: 'kagent', name: 'kagent' },
        agentTemplate: { namespace: 'kagent', name: 'sre-agent' },
        state: 'AGENT_INSTANCE_STATE_SUSPENDED',
        createdAt: '2026-09-11T00:00:00Z',
        updatedAt: '2026-09-11T01:00:00Z',
        name: `instance ${id}`,
        contextId: `ctx-${id}`,
        ...overrides,
      };
    }

    /** A `ListTasksResponse` whose single task reports `state`. */
    function tasks(state: string, timestamp: string) {
      return {
        tasks: [{ id: 't1', contextId: 'c1', status: { state, timestamp } }],
        totalSize: 1,
      };
    }

    it('reads the newest task state of a ready or suspended instance', async () => {
      listSessions.mockResolvedValue({
        agentInstances: [
          instance('a'),
          instance('b', { state: 'AGENT_INSTANCE_STATE_READY' }),
        ],
      });
      listSessionTasks.mockImplementation(async (id: string) =>
        id === 'a'
          ? tasks('TASK_STATE_INPUT_REQUIRED', '2026-09-11T01:00:00Z')
          : tasks('TASK_STATE_WORKING', '2026-09-11T01:30:00Z'),
      );

      const result = await reader().read('tok');

      expect(result.states).toEqual([
        {
          sessionId: 'a',
          state: 'input-required',
          changedAt: Date.parse('2026-09-11T01:00:00Z'),
        },
        {
          sessionId: 'b',
          state: 'working',
          changedAt: Date.parse('2026-09-11T01:30:00Z'),
        },
      ]);
      expect(listSessionTasks).toHaveBeenCalledTimes(2);
    });

    it('takes a failed, creating or deleting instance’s own state without a task read', async () => {
      listSessions.mockResolvedValue({
        agentInstances: [
          instance('failed', {
            state: 'AGENT_INSTANCE_STATE_FAILED',
            failure: { reason: 'ActorFailed', message: 'no worker' },
          }),
          instance('creating', { state: 'AGENT_INSTANCE_STATE_CREATING' }),
          instance('ok'),
        ],
      });
      listSessionTasks.mockResolvedValue(
        tasks('TASK_STATE_COMPLETED', '2026-09-11T01:00:00Z'),
      );

      const result = await reader().read('tok');

      expect(listSessionTasks).toHaveBeenCalledTimes(1);
      expect(listSessionTasks).toHaveBeenCalledWith(
        'ok',
        expect.anything(),
        expect.anything(),
      );
      expect(result.states).toEqual(
        expect.arrayContaining([
          {
            sessionId: 'failed',
            state: 'failed',
            changedAt: Date.parse('2026-09-11T01:00:00Z'),
          },
          {
            sessionId: 'creating',
            state: 'creating',
            changedAt: Date.parse('2026-09-11T01:00:00Z'),
          },
          expect.objectContaining({ sessionId: 'ok', state: 'completed' }),
        ]),
      );
      expect(result.skipped).toBe(0);
    });
  });
});
