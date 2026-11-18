import {
  AgentgatewayCostCatalogLookupsTotal as CatalogLookups,
  AgentgatewayGenAiClientCostUsdTotal as Cost,
  AgentgatewayGenAiClientTokenUsage as TokenUsage,
  AgentgatewayGenAiServerRequestDuration as RequestDuration,
  AgentgatewayGenAiServerTimePerOutputToken as TimePerOutputToken,
  AgentgatewayRequestsTotal as Requests,
} from '@giantswarm/backstage-plugin-gs';
import {
  counterIncrease,
  durationSeconds,
  formatDuration,
  previousUsageMonth,
  promqlString,
  usageMonthBounds,
  type UsageMonth,
} from '@giantswarm/backstage-plugin-agent-platform-common';

/**
 * Every PromQL query the LLM usage views run, in one place. Built by
 * functions, never at module load: the metric definitions come from gs, and a
 * module that merely imports this file (the plugin's index, through the model
 * page) must not need them to be there.
 *
 * Built from the constants in the gs plugin's central metric registry rather
 * than from metric-name strings, which is what makes the dependency visible
 * from that registry — see the `mimir-metrics` skill.
 *
 * **Every counter goes through {@link counterIncrease}**, never a bare
 * `increase()`/`rate()`: those drop the first sample of every series, which
 * on a young installation is most of its usage.
 *
 * **Nothing here filters by `gateway`.** An installation's gateways all serve
 * the same platform, so summing across them is the figure a reader wants; the
 * Grafana dashboard's `$gateway` variable exists to let an operator isolate
 * one, which is not this page's job.
 */

/** The window every total and breakdown covers. */
export const WINDOW = '30d';
export const WINDOW_DAYS = 30;

/**
 * The Gateway listener carrying inference traffic — the platform chart's name
 * for it. Only `agentgateway_requests_total` needs it: every other listener
 * carries MCP and UI traffic, and folding those in would misreport the
 * model-call error rate. An installation that renamed the listener reports no
 * requests and no errors here rather than wrong ones, and the reliability
 * figures degrade to "—".
 */
export const LLM_LISTENER = 'llm';

/**
 * Cost and tokens are grouped by agent, model *and* token type in one query
 * each. That single grouping yields the totals, the per-agent breakdown, the
 * per-model breakdown and the token-type split — four views for one round
 * trip, and they cannot disagree with each other because they are reductions
 * of the same numbers.
 */
const BY_AGENT_MODEL_TYPE =
  'agent_namespace, agent, gen_ai_response_model, gen_ai_token_type';

/** The duration metric carries no token type, so calls group one level up. */
const BY_AGENT_MODEL = 'agent_namespace, agent, gen_ai_response_model';

/** What the usage queries cover. */
export type LlmUsageQueryOptions = {
  /** The window, in whole days. Defaults to {@link WINDOW_DAYS}. */
  days?: number;
  /**
   * Only the traffic of agents in this organization, the Kubernetes namespace
   * an agent runs in (`agent_namespace`). All agents when absent.
   */
  org?: string;
  /**
   * One calendar month (`YYYY-MM`, UTC) instead of the days: a past month is
   * its exact days, evaluated at its end; the current month is month-to-date.
   * Takes precedence over `days`.
   */
  month?: UsageMonth;
  /** The clock, for the current month's elapsed range. Defaults to now. */
  now?: number;
};

/**
 * Where a window's queries evaluate and how far they reach: the shape every
 * builder below shares, so the totals, the breakdowns and the by-person rows
 * cover the same seconds.
 */
export type UsageWindowSpec = {
  /** The PromQL range the counters grow over. */
  range: string;
  /** The evaluation time (the `@` modifier) for a window that ended; none for one ending now. */
  at?: number;
  /** Whole days the window covers, today included where it is still open. */
  windowDays: number;
  /** Where the window starts, for the "data reaches back to here" checks. */
  windowStart: DataBeforeAt;
  /**
   * The window just before this one, for the change against it: the same
   * number of days before a days window, the previous month before a past
   * month. None for the current month, which is still being written.
   */
  previous?: {
    range: string;
    offset?: string;
    at?: number;
    windowStart: DataBeforeAt;
  };
};

/** A point in time named either by an offset from the evaluation or absolutely. */
type DataBeforeAt = { offsetSeconds?: number; at?: number };

const DAY_SECONDS = 86400;

/**
 * How coarsely the clock is read where a query's range grows with it — today's
 * partial bar ({@link todayPartialRange}) and a month still being written
 * ({@link usageWindowSpec}) — so their query keys move every five minutes, not
 * per render. The hook that reads the clock for them snaps to the same grid.
 */
export const CLOCK_SNAP_SECONDS = 300;

/**
 * The query shape of a window: a days window grows the counters over the last
 * N days and compares with the N before; a past month grows them over the
 * month's days evaluated at the month's end and compares with the month
 * before; the current month grows them over the seconds since the month
 * started (snapped, as today's partial bar is, so the query key holds still)
 * and compares with nothing yet.
 */
export function usageWindowSpec({
  days,
  month,
  now = Date.now(),
}: Pick<LlmUsageQueryOptions, 'days' | 'month' | 'now'> = {}): UsageWindowSpec {
  if (month === undefined) {
    const windowDays = windowDaysOf(days);
    const range = `${windowDays}d`;
    return {
      range,
      windowDays,
      windowStart: { offsetSeconds: durationSeconds(range) },
      previous: {
        range,
        offset: range,
        windowStart: { offsetSeconds: 2 * durationSeconds(range) },
      },
    };
  }
  const bounds = usageMonthBounds(month, now);
  if (bounds.current) {
    const elapsed = Math.floor(now / 1000) - bounds.start;
    const snapped =
      Math.floor(elapsed / CLOCK_SNAP_SECONDS) * CLOCK_SNAP_SECONDS;
    return {
      range: `${Math.max(snapped, 60)}s`,
      windowDays: Math.floor(elapsed / DAY_SECONDS) + 1,
      windowStart: { at: bounds.start },
    };
  }
  const previous = usageMonthBounds(previousUsageMonth(month), now);
  return {
    range: `${bounds.days}d`,
    at: bounds.end,
    windowDays: bounds.days,
    windowStart: { at: bounds.start },
    previous: {
      range: `${previous.days}d`,
      at: bounds.start,
      windowStart: { at: previous.start },
    },
  };
}

/** A positive whole number of days; anything else is the default window. */
export function windowDaysOf(days: number | undefined): number {
  if (days === undefined || !Number.isFinite(days)) {
    return WINDOW_DAYS;
  }
  return Math.max(1, Math.round(days));
}

/**
 * The label matcher restricting a gen_ai metric to one organization, or the
 * empty string. The value is escaped, so a namespace read from the URL cannot
 * change the query's shape.
 */
function orgSelector(org: string | undefined): string {
  return org ? `{agent_namespace="${promqlString(org)}"}` : '';
}

/**
 * How far before a point {@link dataBefore} looks for a sample.
 *
 * A gateway series exists only from its label set's first call since its pod
 * started, so a restart followed by a quiet spell (a weekend) leaves no series
 * at all — a day's lookback mistook that for data not reaching back. A week
 * is still a small read beside the window-long queries the page already runs.
 */
export const DATA_START_LOOKBACK = '7d';

/**
 * Whether any token series has a sample in the {@link DATA_START_LOOKBACK}
 * before `secondsAgo`: one sample, or an empty vector. The one definition of
 * "the data reaches back to here" behind both the data-start note and the
 * spend change.
 *
 * Tokens rather than cost: every model call records them, priced or not, so a
 * window of unpriced calls still counts as recorded.
 */
function dataBefore(only: string, before: DataBeforeAt): string {
  const shift =
    before.offsetSeconds === undefined
      ? ''
      : ` offset ${formatDuration(before.offsetSeconds)}`;
  const pin = before.at === undefined ? '' : ` @ ${before.at}`;
  return `count(last_over_time(${TokenUsage.name}_sum${only}[${DATA_START_LOOKBACK}]${shift}${pin}))`;
}

/**
 * The namespaces the gateway attributed calls to in the window, one series
 * per `agent_namespace`, for the Organization scope's options. Never
 * narrowed to an organization: the options are what the control chooses
 * from, so they are the same whichever one is chosen. The value is a count
 * of series and is not read.
 *
 * Tokens rather than cost, as {@link dataBefore}: every model call records
 * them, so an organization whose models the catalogue cannot price is still
 * an option.
 */
export function organizationsSeenQueryFor(
  options: Pick<LlmUsageQueryOptions, 'days' | 'month' | 'now'> = {},
): string {
  const { range, at } = usageWindowSpec(options);
  const pin = at === undefined ? '' : ` @ ${at}`;
  return `count by (agent_namespace) (last_over_time(${TokenUsage.name}_sum[${range}]${pin}))`;
}

/**
 * The LLM usage queries for a window and, optionally, one organization.
 *
 * `previousCost` is the same spend over the window just before this one
 * (`offset`), for the change against the previous period.
 *
 * `requestsByStatus` and `unpricedLookups` stay installation-wide: their
 * metrics carry no `agent_namespace` label.
 */
export function llmUsageQueriesFor({
  days,
  org,
  month,
  now,
}: LlmUsageQueryOptions = {}) {
  const spec = usageWindowSpec({ days, month, now });
  const { range: window, at } = spec;
  const only = orgSelector(org);
  const grow = (series: string) =>
    counterIncrease(series, window, undefined, at);
  return {
    /** Priced spend, split every way the page needs it. */
    cost: `sum by (${BY_AGENT_MODEL_TYPE}) ${grow(`${Cost.name}${only}`)}`,
    /** Tokens, same grouping — needs no price catalogue, so always trustworthy. */
    tokens: `sum by (${BY_AGENT_MODEL_TYPE}) ${grow(`${TokenUsage.name}_sum${only}`)}`,
    /** Model calls, from the duration histogram's count. */
    calls: `sum by (${BY_AGENT_MODEL}) ${grow(`${RequestDuration.name}_count${only}`)}`,
    /**
     * Output speed of the **median** streamed call, as tokens per second.
     *
     * The histogram observes one value per streamed call — that call's own mean
     * seconds per output token — so the window's mean (`_count / _sum`) weights
     * a three-token reply exactly like a three-thousand-token one, and a reply
     * that emitted a handful of tokens after a long wait is seconds *per token*.
     * On `graveler` that put ~1% of calls at ≥ 2.5 s/token, which alone dragged
     * the mean from the median's 16 ms to 461 ms: 63 tok/s reported as 2 tok/s.
     * The median is the speed a call actually runs at, and it is the same idiom
     * as the two duration quantiles beside it on the strip.
     *
     * Inverted in PromQL rather than in the reducer so the metric and its unit
     * stay in one place. Both failure modes stay honest: an empty histogram
     * quantile is `NaN`, a zero quantile makes this `+Inf`, and `sampleValue`
     * rejects either, so the figure degrades to "—".
     *
     * Ungrouped, because it is one figure about the platform rather than a
     * breakdown. A call that was not streamed observes nothing, so this
     * describes the streamed subset of `calls`.
     *
     * The buckets' growth comes from {@link counterIncrease}, not `rate()`: a
     * quantile is the same whether the buckets hold rates or increases over
     * one window (`rate` is every bucket divided by the same range), so the
     * only difference is that a newborn series' first observations count —
     * the same for the two duration quantiles below.
     */
    outputTokensPerSecond: `1 / histogram_quantile(0.50, sum by (le) ${grow(`${TimePerOutputToken.name}_bucket${only}`)})`,
    durationP50: `histogram_quantile(0.50, sum by (le) ${grow(`${RequestDuration.name}_bucket${only}`)})`,
    durationP95: `histogram_quantile(0.95, sum by (le) ${grow(`${RequestDuration.name}_bucket${only}`)})`,
    requestsByStatus: `sum by (status) ${grow(`${Requests.name}{listener="${LLM_LISTENER}"}`)}`,
    /**
     * Every model whose price lookup did not resolve. Empty is the healthy
     * state, and `> 0` keeps stale zero-valued series out of the table.
     */
    unpricedLookups: `sum by (gen_ai_request_model, gen_ai_response_model, status) ${grow(`${CatalogLookups.name}{status!="Exact"}`)} > 0`,
    /**
     * {@link cost} over the window before this one: the same days before a
     * days window, the previous month before a past month; none for the
     * current month, which is still being written.
     */
    previousCost: spec.previous
      ? `sum by (${BY_AGENT_MODEL_TYPE}) ${counterIncrease(`${Cost.name}${only}`, spec.previous.range, spec.previous.offset, spec.previous.at)}`
      : undefined,
    /**
     * Whether the gateway recorded anything in the
     * {@link DATA_START_LOOKBACK} before this window starts: one sample, or
     * none. Gates the "data starts on …" note, so a window whose first days
     * merely had no calls does not read as one the data does not reach.
     */
    dataBeforeWindow: dataBefore(only, spec.windowStart),
    /**
     * The same check before the *previous* window starts. Without data
     * there, {@link previousCost} covers only part of its window and the
     * change against it overstates growth — on a gateway whose metrics began
     * mid-window it read "▲ 330%".
     */
    dataBeforePreviousWindow: spec.previous
      ? dataBefore(only, spec.previous.windowStart)
      : undefined,
  };
}

/**
 * Spend and tokens by the person behind the calls, the gateway's `user`
 * label (an email, or `unknown` where the runtime named nobody), over the
 * same window as {@link llmUsageQueriesFor}: the monthly view's by-person
 * table (giantswarm/backstage#2672). No model calls: the duration histogram
 * is the server's, and the label is not asserted on it. Tokens keep
 * `gen_ai_token_type` so each person's tokens are counted once.
 */
export function byPersonQueriesFor({
  days,
  org,
  month,
  now,
}: LlmUsageQueryOptions = {}) {
  const { range, at } = usageWindowSpec({ days, month, now });
  const only = orgSelector(org);
  return {
    cost: `sum by (user) ${counterIncrease(`${Cost.name}${only}`, range, undefined, at)}`,
    tokens: `sum by (user, gen_ai_token_type) ${counterIncrease(`${TokenUsage.name}_sum${only}`, range, undefined, at)}`,
  };
}

/**
 * The daily range queries, optionally for one organization. `[1d]` rather than
 * the window: each evaluation point totals the day it closes, which is what a
 * daily bar means.
 */
export function llmUsageRangeQueriesFor({
  org,
}: Pick<LlmUsageQueryOptions, 'org'> = {}) {
  const only = orgSelector(org);
  return {
    costPerDayByModel: `sum by (gen_ai_response_model) ${counterIncrease(`${Cost.name}${only}`, '1d')}`,
    tokensPerDayByType: `sum by (gen_ai_token_type) ${counterIncrease(`${TokenUsage.name}_sum${only}`, '1d')}`,
    /**
     * Model calls per day, for the Overview's activity heatmap: the same
     * duration-histogram count `calls` totals over the window, one day at a
     * time and ungrouped — the heatmap is one figure per day. Only run when a
     * view asks for it (`dailyCalls`), so the Cost tab does not pay for it.
     */
    callsPerDay: `sum ${counterIncrease(`${RequestDuration.name}_count${only}`, '1d')}`,
  };
}

export type RangeWindow = { start: string; end: string; step: string };

/** Today's UTC midnight, in Unix seconds. */
function todayMidnight(now: number): number {
  return Math.floor(now / 1000 / DAY_SECONDS) * DAY_SECONDS;
}

/**
 * The range window for the **complete** days of the chart: one evaluation
 * point per UTC midnight, ending at today's.
 *
 * A point at a midnight totals the *preceding* calendar day, so the last one
 * closes yesterday. Today cannot come from this query at all: a point in the
 * future would make `increase()` extrapolate a partial day up to a whole one,
 * always on the newest and most-read bar. {@link todayPartialRange} covers it
 * separately, which is why this stops one day short of
 * {@link WINDOW_DAYS} — the chart's last row is today's.
 *
 * Every value snaps to a midnight, so the result is **stable for a whole day**
 * — which it has to be, since `start`/`end`/`step` are part of
 * `useMimirRangeQuery`'s query key and a moving key refetches forever.
 */
export function dailyRangeWindow(
  now: number = Date.now(),
  days: number = WINDOW_DAYS,
): RangeWindow {
  const end = todayMidnight(now);
  const completeDays = windowDaysOf(days) - 1;
  // A one-day window has no complete day: `start` lands one step past `end`,
  // so the window holds no point and {@link hasCompleteDays} is false.
  const start = end - (completeDays - 1) * DAY_SECONDS;

  return { start: String(start), end: String(end), step: String(DAY_SECONDS) };
}

/**
 * Whether the range holds at least one evaluation point. A range without one
 * is not a valid range query, so the caller skips the query and the chart is
 * today's partial row alone.
 */
export function hasCompleteDays(range: RangeWindow): boolean {
  return Number(range.start) <= Number(range.end);
}

/**
 * How much of today has elapsed, as a PromQL duration, for the instant query
 * that supplies today's partial bar.
 *
 * `increase(...[<elapsed>])` evaluated now covers exactly midnight→now, so the
 * bar is today's real spend so far rather than a projection of it.
 *
 * **Snapped down to five minutes, and that is load-bearing.** This string goes
 * into the query, and the query is part of `useMimirQuery`'s cache key — so a
 * value that moved every second re-keyed on every render: response lands →
 * re-render → new key → fresh fetch → `isLoading` true again, forever. Both
 * gateway tabs sat on a permanent spinner while issuing a Mimir round trip per
 * render. Any change here has to keep the value stable across a render.
 *
 * Five minutes rather than the hour: snapping *down* means today's bar omits
 * whatever has happened since the last boundary, and an hour of a partial day
 * is a visible hole right after an expensive agent run. Snapping *up* would
 * instead pull the tail of yesterday into today's bar. Five minutes keeps the
 * omission negligible on a daily bar and still re-keys only twelve times an
 * hour, against a 30-second `staleTime`.
 *
 * Floored at a minute because a zero-length range is not a legal PromQL
 * duration, and just after midnight there is nothing to show anyway.
 */
export function todayPartialRange(now: number = Date.now()): string {
  const elapsed = Math.floor(now / 1000) - todayMidnight(now);
  const snapped = Math.floor(elapsed / CLOCK_SNAP_SECONDS) * CLOCK_SNAP_SECONDS;
  return `${Math.max(snapped, 60)}s`;
}

/**
 * The calendar days the charts render, oldest first, as the `YYYY-MM-DD` keys
 * they are indexed by. The last is **today**, and its bar is partial.
 *
 * The charts render **one bar per day in this list**, whether or not Mimir
 * returned anything for it — so the axis is the window the page claims, and a
 * bar's width means the same thing on every installation. Without it a series
 * with one day of data drew one bar spanning the whole chart, which reads as
 * "one enormous day" rather than "we have a day of history".
 *
 * Derived from the **range**, not from a second `Date.now()`. Two reasons: the
 * caller can then memoise on `range.start`, which is midnight-snapped and so a
 * genuinely stable key rather than an unused dependency; and a hook that read
 * the clock twice could straddle midnight and produce an axis that disagreed
 * with the query that filled it.
 */
export function dailyWindowDayKeys(range: RangeWindow): string[] {
  const keys: string[] = [];
  // A range point at `t` covers the day before it.
  for (
    let at = Number(range.start);
    at <= Number(range.end);
    at += DAY_SECONDS
  ) {
    keys.push(dayKey(at - DAY_SECONDS));
  }
  // `end` is today's midnight, so today is the row past the last point.
  keys.push(dayKey(Number(range.end)));
  return keys;
}

/**
 * Today's key, for the row {@link todayPartialRange} fills.
 *
 * Also read off the range's `end`, so it cannot disagree with the axis.
 */
export function todayDayKey(range: RangeWindow): string {
  return dayKey(Number(range.end));
}

/**
 * The daily range of one calendar month, and the days its charts render.
 *
 * As {@link dailyRangeWindow}: a point at a midnight covers the day before
 * it, so the first point sits one day after the month starts and the last on
 * the next month's first midnight for a past month. The current month's last
 * point is today's midnight, and today is its own partial row, filled by
 * {@link todayPartialQueries}; a past month has no partial row, so `today` is
 * absent. On the first of the month there is no complete day yet
 * ({@link hasCompleteDays} is false) and the chart is today's row alone.
 */
export function monthRangeWindow(
  month: UsageMonth,
  now: number = Date.now(),
): { range: RangeWindow; days: string[]; today?: string } {
  const bounds = usageMonthBounds(month, now);
  const first = bounds.start + DAY_SECONDS;
  const last = bounds.current ? todayMidnight(now) : bounds.end;
  const range = {
    start: String(first),
    end: String(last),
    step: String(DAY_SECONDS),
  };
  const days: string[] = [];
  for (let at = first; at <= last; at += DAY_SECONDS) {
    days.push(dayKey(at - DAY_SECONDS));
  }
  if (!bounds.current) {
    return { range, days };
  }
  const today = dayKey(todayMidnight(now));
  days.push(today);
  return { range, days, today };
}

function dayKey(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString().slice(0, 10);
}

/**
 * Today's partial totals, one instant query per chart.
 *
 * Same grouping as the corresponding range query, so the values land in the
 * same series keys and the appended row stacks like every other.
 */
export function todayPartialQueries(
  range: string,
  { org }: Pick<LlmUsageQueryOptions, 'org'> = {},
) {
  const only = orgSelector(org);
  return {
    costByModel: `sum by (gen_ai_response_model) ${counterIncrease(`${Cost.name}${only}`, range)}`,
    tokensByType: `sum by (gen_ai_token_type) ${counterIncrease(`${TokenUsage.name}_sum${only}`, range)}`,
    /** Today's cell of the activity heatmap — see `callsPerDay`. */
    calls: `sum ${counterIncrease(`${RequestDuration.name}_count${only}`, range)}`,
  };
}

/**
 * The window the $/token rate is averaged over, in days, for the session detail strip
 * and the sessions tab.
 *
 * Shorter than the usage pages' window on purpose: a rate is applied to individual
 * sessions, so it should reflect the model mix in use now rather than one a
 * month of history has flattened.
 */
export const RATE_WINDOW_DAYS = 7;

/**
 * {@link RATE_WINDOW_DAYS} as the PromQL duration the queries take. Not
 * exported, so copy cannot pick it up: it names the window with
 * `lastDaysNoun(RATE_WINDOW_DAYS)`.
 */
const RATE_WINDOW = `${RATE_WINDOW_DAYS}d`;

/**
 * The two queries behind {@link useTokenRates}: cost and tokens over
 * {@link RATE_WINDOW}, grouped by agent and token type.
 *
 * Grouped by model as well as by agent, so **one pair of responses yields
 * every tier** — a model's rate, an agent's, and the installation's — and the
 * light rate hook stays at two round trips whichever the caller wants. Because
 * the caller picks its rows out of the response rather than filtering in
 * PromQL, no user-derived value is ever interpolated into a query either.
 *
 * The extra label costs nothing in practice: the cardinality is agents ×
 * models × token types on one installation.
 */
export function tokenRateQueries() {
  return {
    cost: `sum by (agent_namespace, agent, gen_ai_response_model, gen_ai_token_type) ${counterIncrease(Cost.name, RATE_WINDOW)}`,
    tokens: `sum by (agent_namespace, agent, gen_ai_response_model, gen_ai_token_type) ${counterIncrease(`${TokenUsage.name}_sum`, RATE_WINDOW)}`,
  } as const;
}
