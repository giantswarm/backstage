import { mockServices } from '@backstage/backend-test-utils';
import { NotFoundError } from '@backstage/errors';
import { KagentClient } from './KagentClient';
import { SessionUsageReader } from './sessionUsage';

const NOW = Date.parse('2026-09-04T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

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
    agent_id: 'kagent__NS__sre_agent',
    ...overrides,
  };
}

/** A task envelope with one turn carrying a usage bag and optional calls. */
function wireTasks(
  opts: {
    timestamp?: string;
    prompt?: number;
    completion?: number;
    tools?: string[];
  } = {},
) {
  const {
    timestamp = '2026-09-04T11:00:00Z',
    prompt = 100,
    completion = 10,
    tools = [],
  } = opts;
  return {
    error: false,
    data: [
      {
        id: 't1',
        contextId: 'c1',
        kind: 'task',
        status: { state: 'completed', timestamp },
        history: [
          {
            kind: 'message',
            role: 'agent',
            messageId: `m-${timestamp}`,
            metadata: {
              kagent_usage_metadata: {
                promptTokenCount: prompt,
                candidatesTokenCount: completion,
              },
            },
            parts: tools.map((name, i) => ({
              kind: 'data',
              data: { name, id: `call-${i}`, args: {} },
              metadata: { kagent_type: 'function_call' },
            })),
          },
        ],
      },
    ],
  };
}

describe('SessionUsageReader', () => {
  const listSessions = jest.fn();
  const listSessionTasks = jest.fn();
  const client = { listSessions, listSessionTasks } as unknown as KagentClient;
  const logger = mockServices.logger.mock();

  function reader(options = {}, now: () => number = () => NOW) {
    return new SessionUsageReader(client, logger, 'gazelle', options, now);
  }

  beforeEach(() => {
    listSessions.mockReset();
    listSessionTasks.mockReset();
  });

  it('totals usage across the caller’s sessions', async () => {
    listSessions.mockResolvedValue({
      error: false,
      data: [wireSession('a'), wireSession('b')],
    });
    listSessionTasks.mockImplementation(async (id: string) =>
      id === 'a'
        ? wireTasks({
            prompt: 1_000,
            completion: 100,
            tools: ['x_kubernetes_get'],
          })
        : wireTasks({
            timestamp: '2026-09-03T11:00:00Z',
            prompt: 500,
            completion: 50,
          }),
    );

    const result = await reader().read('tok');

    expect(result.totals).toEqual({
      sessions: 2,
      turns: 2,
      inputTokens: 1_500,
      outputTokens: 150,
      totalTokens: 1_650,
      toolCalls: 1,
    });
    expect(result.windowDays).toBe(30);
    expect(result.evaluatedAt).toBe(NOW);
    expect(result.unreadable).toEqual([]);
    expect(result.skipped).toBe(0);
  });

  it('never reads tasks for an A2A subagent session', async () => {
    // A delegated agent's cost already arrives through the parent's tool
    // response, so reading its own session would count it twice.
    listSessions.mockResolvedValue({
      error: false,
      data: [wireSession('parent'), wireSession('child', { source: 'agent' })],
    });
    listSessionTasks.mockResolvedValue(wireTasks());

    const result = await reader().read('tok');

    expect(listSessionTasks).toHaveBeenCalledTimes(1);
    expect(result.totals.sessions).toBe(1);
    // Excluded before selection, so it is not "skipped" either.
    expect(result.skipped).toBe(0);
  });

  it('does not count a session with no activity inside the window', async () => {
    // Otherwise the sessions tile would include conversations that saw nothing
    // in the reported 30 days, and disagree with the chart beside it.
    listSessions.mockResolvedValue({
      error: false,
      data: [wireSession('quiet')],
    });
    listSessionTasks.mockResolvedValue(
      wireTasks({ timestamp: '2026-06-01T10:00:00Z' }),
    );

    const result = await reader().read('tok');

    expect(result.totals.sessions).toBe(0);
    expect(result.totals.turns).toBe(0);
  });

  it('groups by the delegating agent, and by null when kagent reports none', async () => {
    listSessions.mockResolvedValue({
      error: false,
      data: [
        wireSession('a', { agent_id: 'kagent__NS__sre_agent' }),
        wireSession('b', { agent_id: 'kagent__NS__reviewer' }),
        wireSession('c', { agent_id: undefined }),
      ],
    });
    listSessionTasks.mockImplementation(async (id: string) =>
      wireTasks({ prompt: id === 'a' ? 1_000 : 100 }),
    );

    const result = await reader().read('tok');

    // Descending by input + output, so the biggest spender is first.
    expect(result.byAgent[0]).toMatchObject({
      agentId: 'kagent__NS__sre_agent',
      sessions: 1,
      inputTokens: 1_000,
    });
    expect(result.byAgent.map(a => a.agentId)).toContain(null);
  });

  it('returns a dense day series across the whole window', async () => {
    // 30 bars that mean 30 days. A sparse series would silently compress the
    // timeline.
    listSessions.mockResolvedValue({ error: false, data: [wireSession('a')] });
    listSessionTasks.mockResolvedValue(wireTasks());

    const result = await reader().read('tok');

    expect(result.daily).toHaveLength(31);
    expect(result.daily[0].day < result.daily[30].day).toBe(true);
    const busy = result.daily.filter(d => d.turns > 0);
    expect(busy).toHaveLength(1);
    expect(busy[0]).toMatchObject({ day: '2026-09-04', inputTokens: 100 });
  });

  it('ranks tools and their muster servers, deterministically', async () => {
    listSessions.mockResolvedValue({ error: false, data: [wireSession('a')] });
    listSessionTasks.mockResolvedValue(
      wireTasks({
        tools: [
          'x_kubernetes_get',
          'x_kubernetes_list',
          'x_prometheus_execute_query',
        ],
      }),
    );

    const result = await reader().read('tok');

    expect(result.topTools.map(t => t.tool)).toEqual([
      'x_kubernetes_get',
      'x_kubernetes_list',
      'x_prometheus_execute_query',
    ]);
    // Two kubernetes calls beat one prometheus call.
    expect(result.topMcpServers).toEqual([
      { server: 'kubernetes', calls: 2 },
      { server: 'prometheus', calls: 1 },
    ]);
  });

  it('caps the top lists at ten', async () => {
    listSessions.mockResolvedValue({ error: false, data: [wireSession('a')] });
    listSessionTasks.mockResolvedValue(
      wireTasks({
        tools: Array.from({ length: 25 }, (_, i) => `x_srv_tool${i}`),
      }),
    );

    const result = await reader().read('tok');

    expect(result.topTools).toHaveLength(10);
    expect(result.totals.toolCalls).toBe(25);
  });

  it('counts sessions past the cap as skipped', async () => {
    listSessions.mockResolvedValue({
      error: false,
      data: Array.from({ length: 5 }, (_, i) => wireSession(`s${i}`)),
    });
    listSessionTasks.mockResolvedValue(wireTasks());

    const result = await reader({ maxSessions: 2 }).read('tok');

    expect(result.totals.sessions).toBe(2);
    expect(result.skipped).toBe(3);
  });

  it('does not count a session outside the activity window as skipped', async () => {
    // A scope decision, not a shortfall — folding it in would make `skipped`
    // permanently non-zero for any account holding an older session.
    listSessions.mockResolvedValue({
      error: false,
      data: [
        wireSession('recent'),
        wireSession('ancient', {
          updated_at: new Date(NOW - 90 * DAY).toISOString(),
        }),
      ],
    });
    listSessionTasks.mockResolvedValue(wireTasks());

    const result = await reader().read('tok');

    expect(result.skipped).toBe(0);
    expect(listSessionTasks).toHaveBeenCalledTimes(1);
  });

  it('keeps one failed read from costing the whole summary', async () => {
    listSessions.mockResolvedValue({
      error: false,
      data: [wireSession('ok'), wireSession('gone')],
    });
    listSessionTasks.mockImplementation(async (id: string) => {
      if (id === 'gone') {
        throw new NotFoundError('deleted between the list and the read');
      }
      return wireTasks();
    });

    const result = await reader().read('tok');

    expect(result.totals.sessions).toBe(1);
    expect(result.unreadable).toEqual(['gone']);
  });

  it('resolves with a zeroed summary when every read fails', async () => {
    // The load-bearing case: a 5xx here would reach Sentry through
    // MiddlewareFactory regardless of our own log level.
    listSessions.mockResolvedValue({
      error: false,
      data: [wireSession('a'), wireSession('b')],
    });
    listSessionTasks.mockRejectedValue(new Error('kagent is having a moment'));

    const result = await reader().read('tok');

    expect(result.totals.sessions).toBe(0);
    expect(result.totals.inputTokens).toBe(0);
    expect(result.unreadable.sort()).toEqual(['a', 'b']);
    // Still a full window, so the page renders an empty chart, not a broken one.
    expect(result.daily).toHaveLength(31);
  });

  it('logs an incomplete pass at debug, as counts, without session ids', async () => {
    listSessions.mockResolvedValue({ error: false, data: [wireSession('a')] });
    listSessionTasks.mockRejectedValue(new Error('nope'));

    await reader().read('tok');

    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('incomplete'),
      expect.objectContaining({ installation: 'gazelle', failed: 1 }),
    );
  });

  it('reports an undated turn without inventing a day for it', async () => {
    listSessions.mockResolvedValue({ error: false, data: [wireSession('a')] });
    listSessionTasks.mockResolvedValue({
      error: false,
      data: [
        {
          id: 't1',
          contextId: 'c1',
          kind: 'task',
          status: { state: 'completed' },
          history: [
            {
              kind: 'message',
              role: 'agent',
              messageId: 'm1',
              metadata: {
                kagent_usage_metadata: {
                  promptTokenCount: 100,
                  candidatesTokenCount: 10,
                },
              },
              parts: [],
            },
          ],
        },
      ],
    });

    const result = await reader().read('tok');

    expect(result.totals.inputTokens).toBe(100);
    expect(result.undatedTurns).toBe(1);
    expect(result.daily.every(d => d.turns === 0)).toBe(true);
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
      return wireTasks();
    });

    await reader({ concurrency: 3 }).read('tok');

    expect(peak).toBe(3);
  });

  it('gives each task read the per-read timeout', async () => {
    listSessions.mockResolvedValue({ error: false, data: [wireSession('a')] });
    listSessionTasks.mockResolvedValue(wireTasks());

    await reader({ taskTimeoutMs: 1234 }).read('tok');

    expect(listSessionTasks).toHaveBeenCalledWith(
      'a',
      { userToken: 'tok' },
      { timeoutMs: 1234 },
    );
  });

  it('stops at the budget and reports the remainder as skipped', async () => {
    listSessions.mockResolvedValue({
      error: false,
      data: Array.from({ length: 6 }, (_, i) => wireSession(`s${i}`)),
    });
    let clock = NOW;
    listSessionTasks.mockImplementation(async () => {
      clock += 1_000;
      return wireTasks();
    });

    const result = await reader(
      { budgetMs: 2_000, concurrency: 1 },
      () => clock,
    ).read('tok');

    expect(result.skipped).toBeGreaterThan(0);
    // A budget cutoff is not a fault: it belongs in `skipped`, never in
    // `unreadable`.
    expect(result.unreadable).toEqual([]);
  });

  describe('caching', () => {
    it('reuses a summary inside the TTL and recomputes after it', async () => {
      listSessions.mockResolvedValue({
        error: false,
        data: [wireSession('a')],
      });
      listSessionTasks.mockResolvedValue(wireTasks());

      let clock = NOW;
      const subject = reader({ cacheTtlMs: 60_000 }, () => clock);

      await subject.read('tok');
      await subject.read('tok');
      expect(listSessions).toHaveBeenCalledTimes(1);

      clock += 61_000;
      await subject.read('tok');
      expect(listSessions).toHaveBeenCalledTimes(2);
    });

    it('never serves one token’s summary to another', async () => {
      listSessions.mockResolvedValue({
        error: false,
        data: [wireSession('a')],
      });
      listSessionTasks.mockResolvedValue(wireTasks());

      const subject = reader({ cacheTtlMs: 60_000 });
      await subject.read('marian');
      await subject.read('someone-else');

      expect(listSessions).toHaveBeenCalledTimes(2);
    });

    it('collapses concurrent passes into one fan-out', async () => {
      listSessions.mockResolvedValue({
        error: false,
        data: [wireSession('a')],
      });
      listSessionTasks.mockResolvedValue(wireTasks());

      const subject = reader({ cacheTtlMs: 60_000 });
      await Promise.all([subject.read('tok'), subject.read('tok')]);

      expect(listSessions).toHaveBeenCalledTimes(1);
    });

    it('does not cache a failed pass', async () => {
      listSessions.mockRejectedValue(new Error('down'));

      const subject = reader({ cacheTtlMs: 60_000 });
      await expect(subject.read('tok')).rejects.toThrow('down');
      await expect(subject.read('tok')).rejects.toThrow('down');

      expect(listSessions).toHaveBeenCalledTimes(2);
    });
  });

  it('honours a configured window, and re-labels rather than lying', async () => {
    listSessions.mockResolvedValue({ error: false, data: [wireSession('a')] });
    listSessionTasks.mockResolvedValue(wireTasks());

    const result = await reader({ windowDays: 7 }).read('tok');

    expect(result.windowDays).toBe(7);
    expect(result.daily).toHaveLength(8);
    expect(result.windowStart).toBe(NOW - 7 * DAY);
  });

  it('floors a configured zero rather than disabling itself', async () => {
    // `??` would let a configured 0 through and evaluate nothing at all.
    listSessions.mockResolvedValue({
      error: false,
      data: [wireSession('a'), wireSession('b')],
    });
    listSessionTasks.mockResolvedValue(wireTasks());

    const result = await reader({ maxSessions: 0, concurrency: 0 }).read('tok');

    expect(result.totals.sessions).toBeGreaterThan(0);
  });
});
