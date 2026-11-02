import { useEffect, useMemo, useRef } from 'react';
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
  byPersonQueriesFor,
  CLOCK_SNAP_SECONDS,
  dailyRangeWindow,
  dailyWindowDayKeys,
  hasCompleteDays,
  llmUsageQueriesFor,
  llmUsageRangeQueriesFor,
  monthRangeWindow,
  todayDayKey,
  todayPartialQueries,
  todayPartialRange,
  usageWindowSpec,
  windowDaysOf,
  type LlmUsageQueryOptions,
} from '../lib/llmUsageQueries';
import type { UsageWindow } from '../lib/usageWindow';

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

export type LlmUsageOptions = LlmUsageQueryOptions & {
  /**
   * Also query the spend over the window before this one, reported as
   * `usage.totals.previousCostUsd` when the data reaches back to that
   * window's start. Off by default: two more queries, one of them a day's
   * read to check that reach.
   */
  comparePrevious?: boolean;
  /**
   * Also query model calls per day, reported as `usage.callsPerDay` — the
   * Overview's activity heatmap. Off by default: two more queries (the daily
   * range and today's partial count) no other view reads.
   */
  dailyCalls?: boolean;
  /**
   * Also query spend and tokens by the person behind the calls, reported as
   * `usage.byPerson` — the monthly view's by-person table. Off by default:
   * two more queries only that view reads.
   */
  byPerson?: boolean;
};

/**
 * A coverage check's answer: whether its vector holds a series, from the data
 * whenever there is any — react-query keeps the last good answer beside a
 * failed background refetch, and one transient Mimir error must not flip the
 * page. `undefined` (unknown) only without data: disabled, or failed before it
 * ever answered.
 */
function hasSeries(query: {
  data?: { data?: { result?: unknown[] } };
}): boolean | undefined {
  const result = query.data?.data?.result;
  return result ? result.length > 0 : undefined;
}

/** Copy for the gateway's own `unknown`: a call it could attribute to no caller. */
const UNKNOWN_AGENT = 'Unattributed';
const UNKNOWN_MODEL = 'Unknown model';
/** Copy for a call whose `user` label names nobody. */
const UNKNOWN_PERSON = 'No person recorded';

/** The clock's grid in milliseconds; see {@link CLOCK_SNAP_SECONDS}. */
const CLOCK_SNAP_MS = CLOCK_SNAP_SECONDS * 1000;

/**
 * Everything the Overview and Cost views read, for one installation: by
 * default its last `WINDOW_DAYS` across every organization, or the window and
 * the organization `options` name.
 *
 * Thirteen queries (two more with `comparePrevious`, two more with
 * `dailyCalls`, two more with `byPerson`): eleven instant and two range,
 * written out one call at a time.
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
export function useLlmUsage(
  installation: string | undefined,
  options: LlmUsageOptions = {},
): LlmUsageView {
  const {
    org,
    month,
    comparePrevious = false,
    dailyCalls = false,
    byPerson = false,
  } = options;
  // The clock, snapped: a month still being written grows its range with it,
  // and the query keys must hold still across a render (see
  // `todayPartialRange`). A days window and a past month never read it.
  const nowSnapped = Math.floor(Date.now() / CLOCK_SNAP_MS) * CLOCK_SNAP_MS;
  const windowDays =
    month === undefined
      ? windowDaysOf(options.days)
      : usageWindowSpec({ month, now: nowSnapped }).windowDays;
  const window: UsageWindow = useMemo(
    () =>
      month === undefined
        ? { kind: 'days', days: windowDays }
        : { kind: 'month', month },
    [month, windowDays],
  );
  const enabled = Boolean(installation);
  const installationName = installation ?? '';
  const llmUsageQueries = useMemo(
    () => llmUsageQueriesFor({ days: windowDays, org, month, now: nowSnapped }),
    [windowDays, org, month, nowSnapped],
  );
  const personQueries = useMemo(
    () => byPersonQueriesFor({ days: windowDays, org, month, now: nowSnapped }),
    [windowDays, org, month, nowSnapped],
  );
  // A month still being written has no previous window to compare with.
  const hasPrevious = llmUsageQueries.previousCost !== undefined;
  const llmUsageRangeQueries = useMemo(
    () => llmUsageRangeQueriesFor({ org }),
    [org],
  );

  // Snapped to UTC midnight, so it is stable for the whole day and cannot
  // re-key the range queries on every render. A month has its own days.
  const monthRange = useMemo(
    () =>
      month === undefined ? undefined : monthRangeWindow(month, nowSnapped),
    [month, nowSnapped],
  );
  const range = monthRange?.range ?? dailyRangeWindow(Date.now(), windowDays);
  const { start, end, step } = range;
  // A one-day window has no complete day to query; today's partial row is
  // the whole chart.
  const rangeEnabled = enabled && hasCompleteDays(range);
  // The charts render one bar per day of this window whether or not Mimir
  // answered for it, so the axis is the window the page claims.
  //
  // Memoised on `start`, which is already midnight-snapped and so a stable
  // per-day key. Without this both are fresh values every render, and since
  // they are dependencies of the `usage` memo below, that memo could never hit
  // — re-running ten vector reductions, two daily series and the agent
  // join on every render, and re-keying every downstream memo with a new
  // `usage` object.
  const days = useMemo(
    () => monthRange?.days ?? dailyWindowDayKeys({ start, end, step }),
    [monthRange, start, end, step],
  );
  // A window that has ended (a past month) has no partial row to fill.
  const today = useMemo(
    () => (monthRange ? monthRange.today : todayDayKey({ start, end, step })),
    [monthRange, start, end, step],
  );
  const hasToday = today !== undefined;
  // Today's bar comes from its own pair of instant queries, scoped to
  // elapsed-time-since-midnight: the range query above deliberately stops at
  // yesterday, because a point in the future makes `increase()` extrapolate a
  // partial day into a whole one. Re-keys every five minutes
  // (`CLOCK_SNAP_SECONDS`), not per render — which is why these two stay out
  // of the blocking `isLoading` below.
  const todayRange = todayPartialRange();
  const todayQueries = todayPartialQueries(todayRange, { org });

  // The ten window queries, from here to `unpricedLookups`, re-key with the
  // clock in a month still being written (`usageWindowSpec`). Each holds its
  // previous answer across that (`keepPreviousAnswer`), as the today queries
  // do, rather than report a first load every five minutes; the hold across
  // a change of scope is undone below (`heldFromAnotherScope`).
  //
  // The by-person rows, the monthly view's: two more vectors, only when a
  // view asks for them.
  const costByPerson = useMimirQuery({
    installationName,
    query: personQueries.cost,
    enabled: enabled && byPerson,
    keepPreviousAnswer: true,
  });
  const tokensByPerson = useMimirQuery({
    installationName,
    query: personQueries.tokens,
    enabled: enabled && byPerson,
    keepPreviousAnswer: true,
  });

  const cost = useMimirQuery({
    installationName,
    query: llmUsageQueries.cost,
    enabled,
    keepPreviousAnswer: true,
  });
  const tokens = useMimirQuery({
    installationName,
    query: llmUsageQueries.tokens,
    enabled,
    keepPreviousAnswer: true,
  });
  const calls = useMimirQuery({
    installationName,
    query: llmUsageQueries.calls,
    enabled,
    keepPreviousAnswer: true,
  });
  const p50 = useMimirQuery({
    installationName,
    query: llmUsageQueries.durationP50,
    enabled,
    keepPreviousAnswer: true,
  });
  const p95 = useMimirQuery({
    installationName,
    query: llmUsageQueries.durationP95,
    enabled,
    keepPreviousAnswer: true,
  });
  const outputTokensPerSecond = useMimirQuery({
    installationName,
    query: llmUsageQueries.outputTokensPerSecond,
    enabled,
    keepPreviousAnswer: true,
  });
  const requestsByStatus = useMimirQuery({
    installationName,
    query: llmUsageQueries.requestsByStatus,
    enabled,
    keepPreviousAnswer: true,
  });
  const unpricedLookups = useMimirQuery({
    installationName,
    query: llmUsageQueries.unpricedLookups,
    enabled,
    keepPreviousAnswer: true,
  });
  const costPerDay = useMimirRangeQuery({
    installationName,
    query: llmUsageRangeQueries.costPerDayByModel,
    start,
    end,
    step,
    enabled: rangeEnabled,
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
    enabled: rangeEnabled,
    // The window re-keys at UTC midnight; hold the previous series rather than
    // reporting a first load.
    keepPreviousAnswer: true,
  });

  const costToday = useMimirQuery({
    installationName,
    query: todayQueries.costByModel,
    enabled: enabled && hasToday,
    // This key moves every five minutes by design, so it must not read as a
    // first load — see the note on `isLoading` below.
    keepPreviousAnswer: true,
  });
  const tokensToday = useMimirQuery({
    installationName,
    query: todayQueries.tokensByType,
    enabled: enabled && hasToday,
    // This key moves every five minutes by design, so it must not read as a
    // first load — see the note on `isLoading` below.
    keepPreviousAnswer: true,
  });

  // The activity heatmap's day-by-day model calls: the same range window and
  // today's-partial split as the two charts above, only when asked for.
  const callsPerDay = useMimirRangeQuery({
    installationName,
    query: llmUsageRangeQueries.callsPerDay,
    start,
    end,
    step,
    enabled: rangeEnabled && dailyCalls,
    keepPreviousAnswer: true,
  });
  const callsToday = useMimirQuery({
    installationName,
    query: todayQueries.calls,
    enabled: enabled && dailyCalls && hasToday,
    keepPreviousAnswer: true,
  });

  const previousCost = useMimirQuery({
    installationName,
    query: llmUsageQueries.previousCost ?? '',
    enabled: enabled && comparePrevious && hasPrevious,
  });
  const dataBeforePreviousWindow = useMimirQuery({
    installationName,
    query: llmUsageQueries.dataBeforePreviousWindow ?? '',
    enabled: enabled && comparePrevious && hasPrevious,
  });
  // Whether the "data starts on …" note may show at all; see `dataStart`.
  const dataBeforeWindow = useMimirQuery({
    installationName,
    query: llmUsageQueries.dataBeforeWindow,
    enabled,
  });

  // What the answers are for, the clock aside. The window queries hold their
  // previous answer across a re-key (see `cost`), which is right when only
  // the clock moved and wrong when the scope did: another organization's or
  // window's numbers must not show under this one's caption, not even for a
  // round trip. The keys move together but the answers arrive one by one, so
  // the page waits for the last held query, not the first: the new scope's
  // spend beside the old scope's latency is a mixed page. A held answer
  // counts as loading until the scope it was fetched for is this one. Only
  // queries that run are asked: a disabled one holds its placeholder for good.
  const anyHeld =
    cost.isPlaceholderData ||
    tokens.isPlaceholderData ||
    calls.isPlaceholderData ||
    p50.isPlaceholderData ||
    p95.isPlaceholderData ||
    outputTokensPerSecond.isPlaceholderData ||
    requestsByStatus.isPlaceholderData ||
    unpricedLookups.isPlaceholderData ||
    (rangeEnabled &&
      (costPerDay.isPlaceholderData || tokensPerDay.isPlaceholderData)) ||
    (rangeEnabled && dailyCalls && callsPerDay.isPlaceholderData) ||
    (byPerson &&
      (costByPerson.isPlaceholderData || tokensByPerson.isPlaceholderData));
  const scope = `${installationName}\n${org ?? ''}\n${month ?? `${windowDays}d`}`;
  const answeredScope = useRef(scope);
  useEffect(() => {
    if (enabled && !anyHeld && cost.data !== undefined) {
      answeredScope.current = scope;
    }
  }, [enabled, anyHeld, cost.data, scope]);
  const heldFromAnotherScope =
    enabled && anyHeld && answeredScope.current !== scope;

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
    heldFromAnotherScope ||
    cost.isLoading ||
    tokens.isLoading ||
    calls.isLoading ||
    p50.isLoading ||
    p95.isLoading ||
    outputTokensPerSecond.isLoading ||
    requestsByStatus.isLoading ||
    unpricedLookups.isLoading ||
    costPerDay.isLoading ||
    tokensPerDay.isLoading ||
    // One small read, waited for so the data-start note does not pop in
    // after the page has rendered. Its failure is not the page's: the note
    // then stays away (`hasSeries`).
    dataBeforeWindow.isLoading ||
    (comparePrevious &&
      hasPrevious &&
      (previousCost.isLoading || dataBeforePreviousWindow.isLoading)) ||
    (dailyCalls && callsPerDay.isLoading) ||
    (byPerson && (costByPerson.isLoading || tokensByPerson.isLoading));
  // The two **range** queries count as page failures alongside the instant
  // vectors. A failed range query leaves `reduceDaily` with nothing, and since
  // `days` is always supplied it densifies to a row of zeros per day — a chart of empty
  // bars directly beneath a strip showing a real non-zero total, with nothing
  // saying a query failed. A refused quantile degrades honestly to `—`; a
  // silently zeroed chart does not.
  //
  // The daily-calls query is *not* among them: it feeds one card, which says
  // so itself when the query failed (`callsPerDay: null`), and the rest of
  // the Overview is still true without it.
  const isError = Boolean(
    cost.error || tokens.error || costPerDay.error || tokensPerDay.error,
  );
  const isAvailable = cost.isAvailable;

  // Booleans, not the query results, so the memo below keys on the answer.
  const hasDataBeforeWindow = hasSeries(dataBeforeWindow);
  const hasDataBeforePreviousWindow = hasSeries(dataBeforePreviousWindow);

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
      outputTokensPerSecond: outputTokensPerSecond.data?.data?.result,
      unpricedLookups: unpricedLookups.data?.data?.result,
      costPerDay: costPerDay.data?.data?.result,
      tokensPerDay: tokensPerDay.data?.data?.result,
      agents: agentRows,
      installation,
      hrefFor,
      unknownAgentLabel: UNKNOWN_AGENT,
      unknownModelLabel: UNKNOWN_MODEL,
      ...(byPerson && {
        costByPerson: costByPerson.data?.data?.result,
        tokensByPerson: tokensByPerson.data?.data?.result,
        unknownPersonLabel: UNKNOWN_PERSON,
      }),
      window,
      days,
      today,
      costToday: costToday.data?.data?.result,
      tokensToday: tokensToday.data?.data?.result,
      ...(dailyCalls && {
        callsPerDay: callsPerDay.error
          ? null
          : (callsPerDay.data?.data?.result ?? []),
        callsToday: callsToday.data?.data?.result,
      }),
      windowDays,
      previousCost:
        comparePrevious && hasPrevious
          ? (previousCost.data?.data?.result ?? [])
          : undefined,
      dataBeforeWindow: hasDataBeforeWindow,
      dataBeforePreviousWindow: hasDataBeforePreviousWindow,
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
    outputTokensPerSecond.data,
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
    windowDays,
    window,
    byPerson,
    costByPerson.data,
    tokensByPerson.data,
    comparePrevious,
    hasPrevious,
    previousCost.data,
    hasDataBeforeWindow,
    hasDataBeforePreviousWindow,
    dailyCalls,
    callsPerDay.data,
    callsPerDay.error,
    callsToday.data,
  ]);

  return { usage, isLoading, isError, isAvailable };
}
