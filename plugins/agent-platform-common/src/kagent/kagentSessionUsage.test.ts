import { normalizeSessionUsage } from './kagentSessionUsage';

/** A well-formed body, as the route builds it. */
function body(overrides: Record<string, unknown> = {}) {
  return {
    evaluatedAt: 1_757_000_000_000,
    windowStart: 1_754_400_000_000,
    windowDays: 30,
    totals: {
      sessions: 14,
      turns: 62,
      inputTokens: 8_400_000,
      outputTokens: 104_000,
      totalTokens: 8_504_000,
      toolCalls: 231,
    },
    daily: [
      { day: '2026-08-06', inputTokens: 1_000, outputTokens: 100, turns: 1 },
      { day: '2026-08-07', inputTokens: 0, outputTokens: 0, turns: 0 },
    ],
    byAgent: [
      {
        agentId: 'kagent__NS__sre_agent',
        sessions: 9,
        turns: 41,
        inputTokens: 6_100_000,
        outputTokens: 71_000,
      },
    ],
    topTools: [{ tool: 'x_kubernetes_get', calls: 84 }],
    topMcpServers: [{ server: 'kubernetes', calls: 84 }],
    undatedTurns: 0,
    unreadable: [],
    skipped: 0,
    ...overrides,
  };
}

describe('normalizeSessionUsage', () => {
  it('reads a well-formed body', () => {
    const usage = normalizeSessionUsage(body());

    expect(usage.totals).toEqual({
      sessions: 14,
      turns: 62,
      inputTokens: 8_400_000,
      outputTokens: 104_000,
      totalTokens: 8_504_000,
      toolCalls: 231,
    });
    expect(usage.windowDays).toBe(30);
    expect(usage.daily).toHaveLength(2);
    expect(usage.byAgent[0].agentId).toBe('kagent__NS__sre_agent');
    expect(usage.topTools).toEqual([{ tool: 'x_kubernetes_get', calls: 84 }]);
    expect(usage.topMcpServers).toEqual([{ server: 'kubernetes', calls: 84 }]);
  });

  it('yields a zeroed summary for a body that is not an object', () => {
    // Rendered as "no usage in the window", which is the honest reading when
    // the backend answered and we could not understand it.
    for (const raw of [null, undefined, 42, 'nope', []]) {
      const usage = normalizeSessionUsage(raw);
      expect(usage.totals.sessions).toBe(0);
      expect(usage.daily).toEqual([]);
      expect(usage.skipped).toBe(0);
    }
  });

  it('never throws', () => {
    expect(() =>
      normalizeSessionUsage({ totals: 'nope', daily: 7 }),
    ).not.toThrow();
  });

  it('drops one malformed row without costing the rest', () => {
    const usage = normalizeSessionUsage(
      body({
        daily: [
          { day: '2026-08-06', inputTokens: 10, outputTokens: 1, turns: 1 },
          { inputTokens: 99 },
          { day: '2026-08-07', inputTokens: 20, outputTokens: 2, turns: 1 },
        ],
        topTools: [
          { tool: 'x_kubernetes_get', calls: 84 },
          { calls: 5 },
          { tool: 'x_github_search', calls: 3 },
        ],
      }),
    );

    expect(usage.daily.map(d => d.day)).toEqual(['2026-08-06', '2026-08-07']);
    expect(usage.topTools.map(t => t.tool)).toEqual([
      'x_kubernetes_get',
      'x_github_search',
    ]);
  });

  it('keeps an explicit null agent and null server', () => {
    // `null` means kagent reported no `agent_id`, or the tool is not proxied.
    // The frontend supplies the wording, so the wire must not invent one.
    const usage = normalizeSessionUsage(
      body({
        byAgent: [
          {
            agentId: null,
            sessions: 1,
            turns: 1,
            inputTokens: 1,
            outputTokens: 1,
          },
        ],
        topMcpServers: [{ server: null, calls: 4 }],
      }),
    );

    expect(usage.byAgent[0].agentId).toBeNull();
    expect(usage.topMcpServers[0].server).toBeNull();
  });

  it('defaults every absent optional', () => {
    const usage = normalizeSessionUsage({});

    expect(usage.unreadable).toEqual([]);
    expect(usage.skipped).toBe(0);
    expect(usage.undatedTurns).toBe(0);
    expect(usage.totals.turns).toBe(0);
  });

  it('coerces a non-finite number to zero', () => {
    // `z.number()` admits NaN and Infinity, and either would render as
    // "NaN tokens" rather than failing anywhere a reader could act on. JSON
    // cannot carry them, but the client hands this whatever it parsed.
    const usage = normalizeSessionUsage(
      body({
        totals: { sessions: NaN, turns: Infinity, inputTokens: 5 },
        undatedTurns: NaN,
      }),
    );

    expect(usage.totals.sessions).toBe(0);
    expect(usage.totals.turns).toBe(0);
    expect(usage.totals.inputTokens).toBe(5);
    expect(usage.undatedTurns).toBe(0);
  });

  it('filters non-strings out of unreadable', () => {
    const usage = normalizeSessionUsage(
      body({ unreadable: ['a', 7, null, 'b'] }),
    );

    expect(usage.unreadable).toEqual(['a', 'b']);
  });

  it('falls back to zeroed totals when totals itself is malformed', () => {
    const usage = normalizeSessionUsage(body({ totals: 'nope' }));

    expect(usage.totals.inputTokens).toBe(0);
    // The rest of the body still survives.
    expect(usage.daily).toHaveLength(2);
  });
});
