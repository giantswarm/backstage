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
  const { start, end, step } = dailyRangeWindow();
  // The charts render one bar per day of this window whether or not Mimir
  // answered for it, so the axis is the 30 days the page claims.
  const days = dailyWindowDayKeys();
  const today = todayDayKey();
  // Today's bar comes from its own pair of instant queries, scoped to
  // elapsed-time-since-midnight: the range query above deliberately stops at
  // yesterday, because a point in the future makes `increase()` extrapolate a
  // partial day into a whole one. Re-keys hourly rather than per render.
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
  });
  const tokensPerDay = useMimirRangeQuery({
    installationName,
    query: llmUsageRangeQueries.tokensPerDayByType,
    start,
    end,
    step,
    enabled,
  });

  const costToday = useMimirQuery({
    installationName,
    query: todayQueries.costByModel,
    enabled,
  });
  const tokensToday = useMimirQuery({
    installationName,
    query: todayQueries.tokensByType,
    enabled,
  });

  const { rows: agentRows } = useAgents();
  const agentDetailRoute = useRouteRef(agentDetailRouteRef);

  const isLoading =
    cost.isLoading ||
    tokens.isLoading ||
    calls.isLoading ||
    p50.isLoading ||
    p95.isLoading ||
    requestsByStatus.isLoading ||
    unpricedLookups.isLoading ||
    costPerDay.isLoading ||
    tokensPerDay.isLoading ||
    costToday.isLoading ||
    tokensToday.isLoading;
  const isError = Boolean(cost.error || tokens.error);
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
    // Snapped to a midnight, so this is a new array with the same contents on
    // every render — react-query's keys are unaffected, and rebuilding the
    // rows once per render is cheaper than memoising 30 strings.
    days,
    today,
  ]);

  return { usage, isLoading, isError, isAvailable };
}
