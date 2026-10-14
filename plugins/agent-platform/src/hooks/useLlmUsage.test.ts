import { renderHook } from '@testing-library/react';
import {
  llmUsageQueriesFor,
  llmUsageRangeQueriesFor,
} from '../lib/llmUsageQueries';
import { useLlmUsage } from './useLlmUsage';

/** The installation-wide queries the hook runs by default. */
const llmUsageQueries = llmUsageQueriesFor();
const llmUsageRangeQueries = llmUsageRangeQueriesFor();

/** Queries reported as still pending, by query string. */
const pending = new Set<string>();
/** Queries reported as failed, by query string. */
const failed = new Set<string>();
/** Every query the hook issued while enabled. */
const issued = new Set<string>();
/** Answers by query string; an empty vector otherwise. */
const answers = new Map<string, unknown[]>();

jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-gs'),
  useMimirQuery: (options: { query: string; enabled?: boolean }) =>
    stub(options),
  useMimirRangeQuery: (options: { query: string; enabled?: boolean }) =>
    stub(options),
}));

function stub({ query, enabled = true }: { query: string; enabled?: boolean }) {
  if (enabled) {
    issued.add(query);
  }
  return {
    data: {
      status: 'success',
      data: { resultType: 'vector', result: answers.get(query) ?? [] },
    },
    isLoading: pending.has(query),
    error: failed.has(query) ? new Error('mimir') : null,
    isAvailable: true,
  };
}

jest.mock('../components/AgentsDataProvider', () => ({
  useAgents: () => ({ rows: [] }),
}));

jest.mock('@backstage/frontend-plugin-api', () => ({
  ...jest.requireActual('@backstage/frontend-plugin-api'),
  useRouteRef: () => undefined,
}));

beforeEach(() => {
  pending.clear();
  failed.clear();
  issued.clear();
  answers.clear();
});

describe('useLlmUsage', () => {
  it('is ready when every query has answered', () => {
    const { result } = renderHook(() => useLlmUsage('gazelle'));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
    expect(result.current.usage).toBeDefined();
  });

  it('does not block the page on the two today queries', () => {
    // Their key moves every five minutes by design, and a fresh key has no
    // cached entry — folding them into `isLoading` blanked the whole populated
    // page back to a spinner each time a boundary passed, losing scroll
    // position and table sort. They only fill today's bar.
    for (const query of pendingTodayQueries()) {
      pending.add(query);
    }

    const { result } = renderHook(() => useLlmUsage('gazelle'));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.usage).toBeDefined();
  });

  it.each([
    ['cost', llmUsageQueries.cost],
    ['tokens', llmUsageQueries.tokens],
    ['cost per day', llmUsageRangeQueries.costPerDayByModel],
  ])('does block the page on the %s query', (_label, query) => {
    pending.add(query);

    const { result } = renderHook(() => useLlmUsage('gazelle'));

    expect(result.current.isLoading).toBe(true);
  });

  it.each([
    ['cost per day', llmUsageRangeQueries.costPerDayByModel],
    ['tokens per day', llmUsageRangeQueries.tokensPerDayByType],
  ])('treats a failed %s range query as a page error', (_label, query) => {
    // A failed range query leaves `reduceDaily` with nothing, and since `days`
    // is always supplied it densifies to a row of zeros per day — a chart of empty bars
    // beneath a strip showing a real non-zero total, with nothing on screen
    // saying a query failed.
    failed.add(query);

    const { result } = renderHook(() => useLlmUsage('gazelle'));

    expect(result.current.isError).toBe(true);
    expect(result.current.usage).toBeUndefined();
  });

  it('tolerates a refused quantile, which degrades to an em dash', () => {
    failed.add(llmUsageQueries.durationP95);

    const { result } = renderHook(() => useLlmUsage('gazelle'));

    expect(result.current.isError).toBe(false);
    expect(result.current.usage).toBeDefined();
  });
});

/**
 * The today queries' exact strings, which embed a moving range — derived the
 * same way the hook does so the test cannot drift from it.
 */
function pendingTodayQueries(): string[] {
  const { todayPartialQueries, todayPartialRange } = jest.requireActual<
    typeof import('../lib/llmUsageQueries')
  >('../lib/llmUsageQueries');
  const queries = todayPartialQueries(todayPartialRange());
  return [queries.costByModel, queries.tokensByType];
}

describe('useLlmUsage with options', () => {
  it('runs the installation-wide 30-day queries and no comparison by default', () => {
    const { result } = renderHook(() => useLlmUsage('gazelle'));

    expect(issued).toContain(llmUsageQueries.cost);
    expect(issued).toContain(llmUsageRangeQueries.costPerDayByModel);
    expect(issued).not.toContain(llmUsageQueriesFor().previousCost);
    expect(result.current.usage?.windowDays).toBe(30);
    expect(result.current.usage?.totals).not.toHaveProperty('previousCostUsd');
  });

  it('runs the window’s and the organization’s queries', () => {
    const queries = llmUsageQueriesFor({ days: 7, org: 'support' });

    const { result } = renderHook(() =>
      useLlmUsage('gazelle', { days: 7, org: 'support' }),
    );

    expect(issued).toContain(queries.cost);
    expect(issued).toContain(queries.durationP50);
    expect(issued).toContain(
      llmUsageRangeQueriesFor({ org: 'support' }).tokensPerDayByType,
    );
    expect(issued).not.toContain(llmUsageQueries.cost);
    expect(result.current.usage?.windowDays).toBe(7);
    expect(result.current.usage?.costPerDay.rows).toHaveLength(7);
  });

  it('runs no range query over a one-day window and charts today alone', () => {
    const { result } = renderHook(() => useLlmUsage('gazelle', { days: 1 }));

    expect(issued).not.toContain(llmUsageRangeQueries.costPerDayByModel);
    expect(issued).not.toContain(llmUsageRangeQueries.tokensPerDayByType);
    expect(issued).toContain(llmUsageQueriesFor({ days: 1 }).cost);
    expect(result.current.usage?.windowDays).toBe(1);
    expect(result.current.usage?.costPerDay.rows).toHaveLength(1);
  });

  it('queries and reports the window it rounds the given days to', () => {
    const { result } = renderHook(() => useLlmUsage('gazelle', { days: 6.6 }));

    expect(issued).toContain(llmUsageQueriesFor({ days: 7 }).cost);
    expect(result.current.usage?.windowDays).toBe(7);
    expect(result.current.usage?.costPerDay.rows).toHaveLength(7);
  });

  it('reports the previous period’s spend when asked', () => {
    const { previousCost, previousCostCovered } = llmUsageQueriesFor();
    answers.set(previousCost, [
      { metric: { agent: 'sre' }, value: [1757462400, '4.5'] },
    ]);
    answers.set(previousCostCovered, [
      { metric: {}, value: [1757462400, '3'] },
    ]);

    const { result } = renderHook(() =>
      useLlmUsage('gazelle', { comparePrevious: true }),
    );

    expect(issued).toContain(previousCost);
    expect(issued).toContain(previousCostCovered);
    expect(result.current.usage?.totals.previousCostUsd).toBe(4.5);
  });

  it('drops the previous period’s spend when the data does not reach its start', () => {
    // On a gateway whose metrics began inside the previous window, that
    // window's spend is partial, and a change against it overstates growth.
    const { previousCost } = llmUsageQueriesFor();
    answers.set(previousCost, [
      { metric: { agent: 'sre' }, value: [1757462400, '4.5'] },
    ]);

    const { result } = renderHook(() =>
      useLlmUsage('gazelle', { comparePrevious: true }),
    );

    expect(result.current.usage?.totals).toHaveProperty('previousCostUsd');
    expect(result.current.usage?.totals.previousCostUsd).toBeUndefined();
  });

  it('drops the previous period’s spend when the coverage check fails', () => {
    const { previousCost, previousCostCovered } = llmUsageQueriesFor();
    answers.set(previousCost, [
      { metric: { agent: 'sre' }, value: [1757462400, '4.5'] },
    ]);
    answers.set(previousCostCovered, [
      { metric: {}, value: [1757462400, '3'] },
    ]);
    failed.add(previousCostCovered);

    const { result } = renderHook(() =>
      useLlmUsage('gazelle', { comparePrevious: true }),
    );

    expect(result.current.isError).toBe(false);
    expect(result.current.usage?.totals.previousCostUsd).toBeUndefined();
  });

  it('compares one organization with its own previous period', () => {
    const { previousCost, previousCostCovered } = llmUsageQueriesFor({
      org: 'support',
    });
    answers.set(previousCost, [
      { metric: { agent: 'sre' }, value: [1757462400, '2.25'] },
    ]);
    answers.set(previousCostCovered, [
      { metric: {}, value: [1757462400, '1'] },
    ]);

    const { result } = renderHook(() =>
      useLlmUsage('gazelle', { org: 'support', comparePrevious: true }),
    );

    expect(previousCost).toContain('agent_namespace="support"');
    expect(previousCost).toContain('offset 30d');
    expect(issued).toContain(previousCost);
    expect(issued).not.toContain(llmUsageQueriesFor().previousCost);
    expect(result.current.usage?.totals.previousCostUsd).toBe(2.25);
  });

  it.each([
    ['spend', llmUsageQueriesFor().previousCost],
    ['coverage check', llmUsageQueriesFor().previousCostCovered],
  ])('waits for the comparison’s %s it asked for', (_label, query) => {
    pending.add(query);

    expect(
      renderHook(() => useLlmUsage('gazelle', { comparePrevious: true })).result
        .current.isLoading,
    ).toBe(true);
    expect(
      renderHook(() => useLlmUsage('gazelle')).result.current.isLoading,
    ).toBe(false);
  });
});

describe('useLlmUsage daily calls (the Overview heatmap)', () => {
  it('neither runs nor reports them unless asked', () => {
    const { result } = renderHook(() => useLlmUsage('gazelle'));

    expect(issued).not.toContain(llmUsageRangeQueries.callsPerDay);
    expect(result.current.usage).not.toHaveProperty('callsPerDay');
  });

  it('reports one row per day of the window when asked', () => {
    const { result } = renderHook(() =>
      useLlmUsage('gazelle', { days: 7, dailyCalls: true }),
    );

    expect(issued).toContain(llmUsageRangeQueries.callsPerDay);
    expect(result.current.usage?.callsPerDay?.rows).toHaveLength(7);
  });

  it('labels a point by the day it covers, and fills today from its own query', () => {
    const { callsPerDay } = llmUsageRangeQueries;
    // A point at a midnight totals the day before it.
    const end = Number(
      jest
        .requireActual<typeof import('../lib/llmUsageQueries')>(
          '../lib/llmUsageQueries',
        )
        .dailyRangeWindow(Date.now(), 7).end,
    );
    answers.set(callsPerDay, [{ metric: {}, values: [[end, '42']] }]);
    const { todayPartialQueries, todayPartialRange } = jest.requireActual<
      typeof import('../lib/llmUsageQueries')
    >('../lib/llmUsageQueries');
    answers.set(todayPartialQueries(todayPartialRange()).calls, [
      { metric: {}, value: [end, '5'] },
    ]);

    const { result } = renderHook(() =>
      useLlmUsage('gazelle', { days: 7, dailyCalls: true }),
    );

    const rows = result.current.usage?.callsPerDay?.rows ?? [];
    expect(rows.slice(-2).map(row => row.calls)).toEqual([42, 5]);
  });

  it('blocks the page on the daily range query, like the other charts', () => {
    pending.add(llmUsageRangeQueries.callsPerDay);

    const { result } = renderHook(() =>
      useLlmUsage('gazelle', { dailyCalls: true }),
    );

    expect(result.current.isLoading).toBe(true);
  });

  it('isolates a failure to the heatmap rather than failing the page', () => {
    failed.add(llmUsageRangeQueries.callsPerDay);

    const { result } = renderHook(() =>
      useLlmUsage('gazelle', { dailyCalls: true }),
    );

    expect(result.current.isError).toBe(false);
    expect(result.current.usage).toBeDefined();
    expect(result.current.usage?.callsPerDay).toBeNull();
  });
});

describe('useLlmUsage data start', () => {
  const { dailyRangeWindow } = jest.requireActual<
    typeof import('../lib/llmUsageQueries')
  >('../lib/llmUsageQueries');
  const DAY = 86400;

  it('names the day the gateway’s data starts when it starts inside the window', () => {
    const { end } = dailyRangeWindow(Date.now(), 7);
    // The newest two complete days hold data; the five before do not.
    const first = Number(end) - DAY;
    answers.set(llmUsageRangeQueries.tokensPerDayByType, [
      {
        metric: { gen_ai_token_type: 'input' },
        values: [
          [first, '10'],
          [Number(end), '0'],
        ],
      },
    ]);

    const { result } = renderHook(() => useLlmUsage('gazelle', { days: 7 }));

    expect(result.current.usage?.dataStart).toEqual({
      day: new Date((first - DAY) * 1000).toISOString().slice(0, 10),
      coveredDays: 3,
    });
  });

  it('says nothing when the data covers the whole window', () => {
    const { start } = dailyRangeWindow(Date.now(), 7);
    answers.set(llmUsageRangeQueries.costPerDayByModel, [
      {
        metric: { gen_ai_response_model: 'm' },
        values: [[Number(start), '0']],
      },
    ]);

    const { result } = renderHook(() => useLlmUsage('gazelle', { days: 7 }));

    expect(result.current.usage?.dataStart).toBeUndefined();
  });
});
