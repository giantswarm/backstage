import { renderHook } from '@testing-library/react';
import { llmUsageQueries, llmUsageRangeQueries } from '../lib/llmUsageQueries';
import { useLlmUsage } from './useLlmUsage';

/** Queries reported as still pending, by query string. */
const pending = new Set<string>();
/** Queries reported as failed, by query string. */
const failed = new Set<string>();

jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-gs'),
  useMimirQuery: ({ query }: { query: string }) => stub(query),
  useMimirRangeQuery: ({ query }: { query: string }) => stub(query),
}));

function stub(query: string) {
  return {
    data: { status: 'success', data: { resultType: 'vector', result: [] } },
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
