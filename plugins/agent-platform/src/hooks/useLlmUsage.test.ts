import { renderHook } from '@testing-library/react';
import {
  llmUsageQueries,
  llmUsageQueriesFor,
  llmUsageRangeQueries,
  llmUsageRangeQueriesFor,
} from '../lib/llmUsageQueries';
import { useLlmUsage } from './useLlmUsage';

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
    // is always supplied it densifies to 30 zero rows — a chart of empty bars
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

  it('reports the previous period’s spend when asked', () => {
    const { previousCost } = llmUsageQueriesFor();
    answers.set(previousCost, [
      { metric: { agent: 'sre' }, value: [1757462400, '4.5'] },
    ]);

    const { result } = renderHook(() =>
      useLlmUsage('gazelle', { comparePrevious: true }),
    );

    expect(issued).toContain(previousCost);
    expect(result.current.usage?.totals.previousCostUsd).toBe(4.5);
  });

  it('waits for the comparison it asked for', () => {
    pending.add(llmUsageQueriesFor().previousCost);

    expect(
      renderHook(() => useLlmUsage('gazelle', { comparePrevious: true })).result
        .current.isLoading,
    ).toBe(true);
    expect(
      renderHook(() => useLlmUsage('gazelle')).result.current.isLoading,
    ).toBe(false);
  });
});
