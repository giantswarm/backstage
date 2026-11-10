import {
  byPersonQueriesFor,
  hasCompleteDays,
  llmUsageQueriesFor,
  monthRangeWindow,
  organizationsSeenQueryFor,
  usageWindowSpec,
} from './llmUsageQueries';

/** 2026-11-02T10:00:00Z: the second day of a month. */
const NOW = Date.parse('2026-11-02T10:00:00Z');
const OCTOBER_START = Date.parse('2026-10-01T00:00:00Z') / 1000;
const OCTOBER_END = Date.parse('2026-11-01T00:00:00Z') / 1000;
const SEPTEMBER_START = Date.parse('2026-09-01T00:00:00Z') / 1000;

describe('usageWindowSpec', () => {
  it('reaches back N days from now for a days window, and compares with the N before', () => {
    expect(usageWindowSpec({ days: 7 })).toEqual({
      range: '7d',
      windowDays: 7,
      windowStart: { offsetSeconds: 7 * 86_400 },
      previous: {
        range: '7d',
        offset: '7d',
        windowStart: { offsetSeconds: 14 * 86_400 },
      },
    });
  });

  it('pins a past month to its end and compares with the month before', () => {
    expect(usageWindowSpec({ month: '2026-10', now: NOW })).toEqual({
      range: '31d',
      at: OCTOBER_END,
      windowDays: 31,
      windowStart: { at: OCTOBER_START },
      previous: {
        range: '30d',
        at: OCTOBER_START,
        windowStart: { at: SEPTEMBER_START },
      },
    });
  });

  it('grows the current month from its start to now, snapped, with nothing to compare', () => {
    const spec = usageWindowSpec({ month: '2026-11', now: NOW });
    // 1 day and 10 hours elapsed: 122400 s, a multiple of the snap.
    expect(spec).toEqual({
      range: '122400s',
      windowDays: 2,
      windowStart: { at: Date.parse('2026-11-01T00:00:00Z') / 1000 },
    });
    // Snapped down to five minutes, so the query key holds still.
    expect(
      usageWindowSpec({ month: '2026-11', now: NOW + 299_000 }).range,
    ).toBe('122400s');
    expect(
      usageWindowSpec({ month: '2026-11', now: NOW + 300_000 }).range,
    ).toBe('122700s');
  });

  it('is a legal range right at the start of a month', () => {
    expect(
      usageWindowSpec({
        month: '2026-11',
        now: Date.parse('2026-11-01T00:00:10Z'),
      }).range,
    ).toBe('60s');
  });
});

describe('llmUsageQueriesFor over a month', () => {
  it('evaluates a past month at its end, with no offset', () => {
    const queries = llmUsageQueriesFor({ month: '2026-10', now: NOW });

    expect(queries.cost).toContain(`[31d] @ ${OCTOBER_END})`);
    expect(queries.cost).toContain(`[1h] offset 31d @ ${OCTOBER_END})`);
    expect(queries.cost).not.toContain('offset 31d)');
    expect(queries.calls).toContain(`@ ${OCTOBER_END}`);
    expect(queries.requestsByStatus).toContain(`@ ${OCTOBER_END}`);
    // The change against September: its 30 days, ending where October starts.
    expect(queries.previousCost).toContain(`[30d] @ ${OCTOBER_START})`);
    expect(queries.dataBeforeWindow).toBe(
      `count(last_over_time(agentgateway_gen_ai_client_token_usage_sum[7d] @ ${OCTOBER_START}))`,
    );
    expect(queries.dataBeforePreviousWindow).toContain(`@ ${SEPTEMBER_START}`);
  });

  it('narrows a month to an organization like a days window', () => {
    const { cost } = llmUsageQueriesFor({
      month: '2026-10',
      org: 'org-acme',
      now: NOW,
    });

    expect(cost).toContain('{agent_namespace="org-acme"}[31d] @');
  });

  it('has no previous window for the month still being written', () => {
    const queries = llmUsageQueriesFor({ month: '2026-11', now: NOW });

    expect(queries.cost).toContain('[122400s]');
    expect(queries.cost).not.toContain(' @ ');
    expect(queries.previousCost).toBeUndefined();
    expect(queries.dataBeforePreviousWindow).toBeUndefined();
    expect(queries.dataBeforeWindow).toContain(
      `@ ${Date.parse('2026-11-01T00:00:00Z') / 1000}`,
    );
  });

  it('keeps the days windows exactly as they were', () => {
    const queries = llmUsageQueriesFor({ days: 7 });

    expect(queries.cost).not.toContain(' @ ');
    expect(queries.previousCost).toContain('[7d] offset 7d)');
    expect(queries.dataBeforeWindow).toContain('[7d] offset 7d))');
  });
});

describe('byPersonQueriesFor', () => {
  it('groups spend and tokens by the user label over the same window', () => {
    const queries = byPersonQueriesFor({ month: '2026-10', now: NOW });

    expect(queries.cost).toMatch(
      /^sum by \(user\) \(increase\(agentgateway_gen_ai_client_cost_usd_total\[31d\] @ \d+\)/,
    );
    expect(queries.tokens).toContain(
      `agentgateway_gen_ai_client_token_usage_sum[31d] @ ${OCTOBER_END}`,
    );
  });

  it('keeps the token type, which counting cached input once needs', () => {
    expect(byPersonQueriesFor({ days: 30 }).tokens).toMatch(
      /^sum by \(user, gen_ai_token_type\) /,
    );
  });

  it('narrows to an organization', () => {
    expect(byPersonQueriesFor({ days: 30, org: 'org-acme' }).cost).toContain(
      '{agent_namespace="org-acme"}[30d]',
    );
  });
});

describe('organizationsSeenQueryFor over a month', () => {
  it('looks in the month, not back from now', () => {
    expect(organizationsSeenQueryFor({ month: '2026-10', now: NOW })).toBe(
      `count by (agent_namespace) (last_over_time(agentgateway_gen_ai_client_token_usage_sum[31d] @ ${OCTOBER_END}))`,
    );
    expect(organizationsSeenQueryFor({ days: 7 })).toContain('[7d]))');
  });
});

describe('monthRangeWindow', () => {
  it('renders every day of a past month, with no partial row', () => {
    const { range, days, today } = monthRangeWindow('2026-10', NOW);

    // The first point, a day after the month starts, covers the 1st; the
    // last, the next month's first midnight, covers the 31st.
    expect(range).toEqual({
      start: String(OCTOBER_START + 86_400),
      end: String(OCTOBER_END),
      step: '86400',
    });
    expect(hasCompleteDays(range)).toBe(true);
    expect(days).toHaveLength(31);
    expect(days[0]).toBe('2026-10-01');
    expect(days[30]).toBe('2026-10-31');
    expect(today).toBeUndefined();
  });

  it('renders the current month to yesterday, and today as its partial row', () => {
    const { range, days, today } = monthRangeWindow('2026-11', NOW);

    expect(range.end).toBe(String(Date.parse('2026-11-02T00:00:00Z') / 1000));
    expect(hasCompleteDays(range)).toBe(true);
    expect(days).toEqual(['2026-11-01', '2026-11-02']);
    expect(today).toBe('2026-11-02');
  });

  it('has no complete day on the first of the month', () => {
    const { range, days, today } = monthRangeWindow(
      '2026-11',
      Date.parse('2026-11-01T09:00:00Z'),
    );

    expect(hasCompleteDays(range)).toBe(false);
    expect(days).toEqual(['2026-11-01']);
    expect(today).toBe('2026-11-01');
  });
});
