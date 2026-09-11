import { useMemo } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import {
  useMimirQuery,
  useMimirRangeQuery,
} from '@giantswarm/backstage-plugin-gs';
import { agentDetailRouteRef } from '../routes';
import { useAgents } from '../components/AgentsDataProvider';
import type { AgentRow } from '../components/AgentsDataProvider';
import { buildLlmUsage, type LlmUsage } from '../lib/llmUsage';
import {
  dailyRangeWindow,
  dailyWindowDayKeys,
  llmUsageQueries,
  llmUsageRangeQueries,
  todayDayKey,
  todayPartialQueries,
  todayPartialRange,
} from '../lib/llmUsageQueries';

export type LlmUsageView = {
  usage: LlmUsage | undefined;
  isLoading: boolean;
  isError: boolean;
  /**
   * `false` when the installation is opted out of Mimir
   * (`mimirEnabled: false`), `undefined` while the installations config loads.
   */
  isAvailable: boolean | undefined;
};

/** Copy for a gateway label that resolves to no `Agent` CR. */
const UNKNOWN_AGENT = 'Unattributed';
const UNKNOWN_MODEL = 'Unknown model';

/**
 * Everything the Overview and Cost views read, for one installation.
 *
 * Eleven queries: nine instant and two range, written out one call at a time.
 * A *fixed* list of hook calls rather than `useQueries` — the same shape
 * `useMimirResourceUsage` uses for its four — and not wrapped in a local
 * helper either, because a helper that calls a hook is unverifiable by
 * `react-hooks/rules-of-hooks` and the fixed order is the whole contract.
 * They share react-query's cache, so the two views cost one round of queries
 * between them and switching tabs refetches nothing.
 *
 * Cost and tokens are each one query grouped by agent, model *and* token type;
 * the totals, both breakdowns and the type split are all reductions of those
 * two answers, which is why they cannot disagree with one another. The two
 * extra instant queries are today's partial bar, which the range query cannot
 * supply without extrapolating it.
 *
 * `isLoading` is every query's, so a view renders once rather than filling in
 * panel by panel. `isError` is deliberately *not*: one failed query (a
 * quantile Mimir refuses, say) leaves the rest of the page true, so only a
 * failure of the two load-bearing vectors counts as the page failing.
 */
export function useLlmUsage(installation: string | undefined): LlmUsageView {
  const enabled = Boolean(installation);
  const installationName = installation ?? '';

  // Snapped to UTC midnight, so it is stable for the whole day and cannot
  // re-key the range queries on every render.
  const range = dailyRangeWindow();
  const { start, end, step } = range;
  // The charts render one bar per day of this window whether or not Mimir
  // answered for it, so the axis is the 30 days the page claims.
  //
  // Memoised on `start`, which is already midnight-snapped and so a stable
  // per-day key. Without this both are fresh values every render, and since
  // they are dependencies of the `usage` memo below, that memo could never hit
  // — re-running eleven vector reductions, two 30-day series and the agent
  // join on every render, and re-keying every downstream memo with a new
  // `usage` object.
  const days = useMemo(
    () => dailyWindowDayKeys({ start, end, step }),
    [start, end, step],
  );
  const today = useMemo(
    () => todayDayKey({ start, end, step }),
    [start, end, step],
  );
  // Today's bar comes from its own pair of instant queries, scoped to
  // elapsed-time-since-midnight: the range query above deliberately stops at
  // yesterday, because a point in the future makes `increase()` extrapolate a
  // partial day into a whole one. Re-keys every five minutes
  // (`PARTIAL_SNAP_SECONDS`), not per render — which is why these two stay out
  // of the blocking `isLoading` below.
  const todayRange = todayPartialRange();
  const todayQueries = todayPartialQueries(todayRange);

  const cost = useMimirQuery({
    installationName,
    query: llmUsageQueries.cost,
    enabled,
  });
  const tokens = useMimirQuery({
    installationName,
    query: llmUsageQueries.tokens,
    enabled,
  });
  const calls = useMimirQuery({
    installationName,
    query: llmUsageQueries.calls,
    enabled,
  });
  const p50 = useMimirQuery({
    installationName,
    query: llmUsageQueries.durationP50,
    enabled,
  });
  const p95 = useMimirQuery({
    installationName,
    query: llmUsageQueries.durationP95,
    enabled,
  });
  const requestsByStatus = useMimirQuery({
    installationName,
    query: llmUsageQueries.requestsByStatus,
    enabled,
  });
  const unpricedLookups = useMimirQuery({
    installationName,
    query: llmUsageQueries.unpricedLookups,
    enabled,
  });
  const costPerDay = useMimirRangeQuery({
    installationName,
    query: llmUsageRangeQueries.costPerDayByModel,
    start,
    end,
    step,
    enabled,
    // The window re-keys at UTC midnight; hold the previous series rather than
    // reporting a first load.
    keepPreviousAnswer: true,
  });
  const tokensPerDay = useMimirRangeQuery({
    installationName,
    query: llmUsageRangeQueries.tokensPerDayByType,
    start,
    end,
    step,
    enabled,
    // The window re-keys at UTC midnight; hold the previous series rather than
    // reporting a first load.
    keepPreviousAnswer: true,
  });

  const costToday = useMimirQuery({
    installationName,
    query: todayQueries.costByModel,
    enabled,
    // This key moves every five minutes by design, so it must not read as a
    // first load — see the note on `isLoading` below.
    keepPreviousAnswer: true,
  });
  const tokensToday = useMimirQuery({
    installationName,
    query: todayQueries.tokensByType,
    enabled,
    // This key moves every five minutes by design, so it must not read as a
    // first load — see the note on `isLoading` below.
    keepPreviousAnswer: true,
  });

  const { rows: agentRows } = useAgents();
  const agentDetailRoute = useRouteRef(agentDetailRouteRef);

  // Deliberately **excludes the two today queries**.
  //
  // Their key moves every five minutes by design, and a fresh key has no
  // cached entry — so folding them in here blanked the whole populated page
  // back to a spinner each time a boundary passed, losing scroll position and
  // table sort for a Mimir round trip. The obvious trigger is leaving the tab
  // and coming back: `refetchOnWindowFocus` re-renders, five minutes have
  // elapsed, and the page flashes. They only fill today's bar, so they are not
  // worth gating the page on; `keepPreviousAnswer` holds the last answer while they
  // refetch.
  const isLoading =
    cost.isLoading ||
    tokens.isLoading ||
    calls.isLoading ||
    p50.isLoading ||
    p95.isLoading ||
    requestsByStatus.isLoading ||
    unpricedLookups.isLoading ||
    costPerDay.isLoading ||
    tokensPerDay.isLoading;
  // The two **range** queries count as page failures alongside the instant
  // vectors. A failed range query leaves `reduceDaily` with nothing, and since
  // `days` is always supplied it densifies to 30 zero rows — a chart of empty
  // bars directly beneath a strip showing a real non-zero total, with nothing
  // saying a query failed. A refused quantile degrades honestly to `—`; a
  // silently zeroed 30-day chart does not.
  const isError = Boolean(
    cost.error || tokens.error || costPerDay.error || tokensPerDay.error,
  );
  const isAvailable = cost.isAvailable;

  const usage = useMemo(() => {
    if (!enabled || isLoading || isError) {
      return undefined;
    }
    const hrefFor = (row: AgentRow) =>
      agentDetailRoute?.({
        installation: row.installation,
        namespace: row.namespace,
        name: row.technicalName,
      });

    return buildLlmUsage({
      cost: cost.data?.data?.result,
      tokens: tokens.data?.data?.result,
      calls: calls.data?.data?.result,
      requestsByStatus: requestsByStatus.data?.data?.result,
      p50: p50.data?.data?.result,
      p95: p95.data?.data?.result,
      unpricedLookups: unpricedLookups.data?.data?.result,
      costPerDay: costPerDay.data?.data?.result,
      tokensPerDay: tokensPerDay.data?.data?.result,
      agents: agentRows,
      installation,
      hrefFor,
      unknownAgentLabel: UNKNOWN_AGENT,
      unknownModelLabel: UNKNOWN_MODEL,
      days,
      today,
      costToday: costToday.data?.data?.result,
      tokensToday: tokensToday.data?.data?.result,
    });
  }, [
    enabled,
    isLoading,
    isError,
    cost.data,
    tokens.data,
    calls.data,
    requestsByStatus.data,
    p50.data,
    p95.data,
    unpricedLookups.data,
    costPerDay.data,
    tokensPerDay.data,
    costToday.data,
    tokensToday.data,
    agentRows,
    installation,
    agentDetailRoute,
    days,
    today,
  ]);

  return { usage, isLoading, isError, isAvailable };
}
