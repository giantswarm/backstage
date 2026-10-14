import {
  AgentgatewayCostCatalogLookupsTotal as CatalogLookups,
  AgentgatewayGenAiClientCostUsdTotal as Cost,
  AgentgatewayGenAiClientTokenUsage as TokenUsage,
  AgentgatewayGenAiServerRequestDuration as RequestDuration,
  AgentgatewayGenAiServerTimePerOutputToken as TimePerOutputToken,
  AgentgatewayRequestsTotal as Requests,
} from '@giantswarm/backstage-plugin-gs';

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
};

/** A positive whole number of days; anything else is the default window. */
export function windowDaysOf(days: number | undefined): number {
  if (days === undefined || !Number.isFinite(days)) {
    return WINDOW_DAYS;
  }
  return Math.max(1, Math.round(days));
}

/** A PromQL string literal's content: backslashes and quotes escaped. */
function promqlString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
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
 * How far before a window's start a series must have a sample to count as
 * already existing there — see {@link counterIncrease}. An hour is sixty
 * scrapes at the gateway PodMonitor's 60 s interval, so a scrape hiccup at the
 * boundary does not make an old series look newborn, while the scan it adds
 * stays an hour per series however long the window.
 */
export const SERIES_BIRTH_LOOKBACK = '1h';

/**
 * The label {@link counterIncrease} puts on its first-sample term so that `or`
 * keeps both terms of a series. Every caller aggregates (`sum by (…)`), which
 * drops it again before a reader sees a series.
 */
export const FIRST_SAMPLE_LABEL = 'first_sample';

const DURATION_UNIT_SECONDS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
  w: 604800,
};

/** A simple PromQL duration (`30d`, `600s`) in seconds. */
function durationSeconds(duration: string): number {
  const match = /^(\d+)([smhdw])$/.exec(duration);
  if (!match) {
    throw new Error(`Not a simple PromQL duration: ${duration}`);
  }
  return Number(match[1]) * DURATION_UNIT_SECONDS[match[2]];
}

/** Seconds as a PromQL duration, in whole days where it divides. */
function formatDuration(seconds: number): string {
  return seconds % 86400 === 0 ? `${seconds / 86400}d` : `${seconds}s`;
}

/**
 * A counter's growth over a window **including the first sample of a series
 * born inside it** — a drop-in for `increase(series[range] offset offset)`
 * that the caller aggregates with `sum by (…)`.
 *
 * Why: `increase()` only sees growth *between* samples, and a Prometheus
 * counter series is born already holding its first value — the gateway
 * creates a series on the first model call for a label set (agent, user,
 * model, token type, pod). So every series loses its first call: on a fresh
 * lab the raw counters held $0.086 while the page said $0.042, and an
 * installation's first turns read "$0 / no model calls". A series with a
 * single sample in the window contributes nothing to `increase()` at all.
 *
 * Semantics: a series with **no sample in the {@link SERIES_BIRTH_LOOKBACK}
 * before the window starts** is taken to have started from zero inside the
 * window, and its smallest in-window value (`min_over_time`, which for a
 * counter is its first value unless it also reset) is added to its
 * `increase()`. Every other series is plain `increase()`. This is the
 * client-side form of what Prometheus's `created-timestamp-zero-ingestion`
 * does at ingestion (a synthetic zero at the series' creation time); that
 * would be exact, but needs the exporter to expose created timestamps and the
 * server flag, neither of which a portal controls.
 *
 * Per series, as PromQL:
 *
 *     increase(S[R] offset O)
 *       or label_replace(
 *            min_over_time(S[R] offset O)
 *              unless last_over_time(S[1h] offset (R+O)),
 *            "first_sample", "true", "__name__", ".*")
 *
 * The `label_replace` gives the first-sample term a label set of its own, so
 * `or` keeps both terms of a series instead of the left one alone, and the
 * caller's `sum by` adds them — one evaluation of each term, where
 * `A + B or A or B` would need two.
 *
 * Residual error, all bounded and none a server change can fix client-side:
 * - **Over-count, small:** for a newborn series `increase()` itself already
 *   extrapolates towards the window start by up to half the average scrape
 *   interval (capped where the counter would reach zero), which overlaps the
 *   added first value. The overlap is at most half the series' *average*
 *   growth per scrape over its in-window life — negligible for a series that
 *   lives hours, a few percent for one that lives minutes.
 * - **Over-count, rare but large:** a series that existed before the window
 *   but has no sample for the whole lookback before its start (a scrape
 *   outage of over an hour exactly at the boundary) is taken as newborn, and
 *   its whole pre-window value is added.
 * - **Under-count:** a newborn series that also reset inside the window adds
 *   its post-reset minimum, not its first value. A series reborn under the
 *   same labels (a gateway container restart, same pod) less than the
 *   lookback after its previous life ended still loses its first sample, as
 *   before.
 * - **Attribution:** the first value lands in the window (or daily bar) its
 *   first *scrape* falls in, at most one scrape interval after the call.
 */
export function counterIncrease(
  series: string,
  range: string,
  offset?: string,
): string {
  const shift = offset ? ` offset ${offset}` : '';
  const windowStart = formatDuration(
    durationSeconds(range) + (offset ? durationSeconds(offset) : 0),
  );
  const newborn = `min_over_time(${series}[${range}]${shift}) unless last_over_time(${series}[${SERIES_BIRTH_LOOKBACK}] offset ${windowStart})`;
  return `(increase(${series}[${range}]${shift}) or label_replace(${newborn}, "${FIRST_SAMPLE_LABEL}", "true", "__name__", ".*"))`;
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
function dataBefore(only: string, secondsAgo: number): string {
  return `count(last_over_time(${TokenUsage.name}_sum${only}[${DATA_START_LOOKBACK}] offset ${formatDuration(secondsAgo)}))`;
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
export function llmUsageQueriesFor({ days, org }: LlmUsageQueryOptions = {}) {
  const window = `${windowDaysOf(days)}d`;
  const only = orgSelector(org);
  return {
    /** Priced spend, split every way the page needs it. */
    cost: `sum by (${BY_AGENT_MODEL_TYPE}) ${counterIncrease(`${Cost.name}${only}`, window)}`,
    /** Tokens, same grouping — needs no price catalogue, so always trustworthy. */
    tokens: `sum by (${BY_AGENT_MODEL_TYPE}) ${counterIncrease(`${TokenUsage.name}_sum${only}`, window)}`,
    /** Model calls, from the duration histogram's count. */
    calls: `sum by (${BY_AGENT_MODEL}) ${counterIncrease(`${RequestDuration.name}_count${only}`, window)}`,
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
    outputTokensPerSecond: `1 / histogram_quantile(0.50, sum by (le) ${counterIncrease(`${TimePerOutputToken.name}_bucket${only}`, window)})`,
    durationP50: `histogram_quantile(0.50, sum by (le) ${counterIncrease(`${RequestDuration.name}_bucket${only}`, window)})`,
    durationP95: `histogram_quantile(0.95, sum by (le) ${counterIncrease(`${RequestDuration.name}_bucket${only}`, window)})`,
    requestsByStatus: `sum by (status) ${counterIncrease(`${Requests.name}{listener="${LLM_LISTENER}"}`, window)}`,
    /**
     * Every model whose price lookup did not resolve. Empty is the healthy
     * state, and `> 0` keeps stale zero-valued series out of the table.
     */
    unpricedLookups: `sum by (gen_ai_request_model, gen_ai_response_model, status) ${counterIncrease(`${CatalogLookups.name}{status!="Exact"}`, window)} > 0`,
    /** {@link cost} over the window before this one. */
    previousCost: `sum by (${BY_AGENT_MODEL_TYPE}) ${counterIncrease(`${Cost.name}${only}`, window, window)}`,
    /**
     * Whether the gateway recorded anything in the
     * {@link DATA_START_LOOKBACK} before this window starts: one sample, or
     * none. Gates the "data starts on …" note, so a window whose first days
     * merely had no calls does not read as one the data does not reach.
     */
    dataBeforeWindow: dataBefore(only, durationSeconds(window)),
    /**
     * The same check before the *previous* window starts. Without data
     * there, {@link previousCost} covers only part of its window and the
     * change against it overstates growth — on a gateway whose metrics began
     * mid-window it read "▲ 330%".
     */
    dataBeforePreviousWindow: dataBefore(only, 2 * durationSeconds(window)),
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

const DAY_SECONDS = 86400;

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

/** How coarsely {@link todayPartialRange} is snapped. See its docblock. */
const PARTIAL_SNAP_SECONDS = 300;

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
  const snapped =
    Math.floor(elapsed / PARTIAL_SNAP_SECONDS) * PARTIAL_SNAP_SECONDS;
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
 * The window the $/token rate is averaged over, for the session detail strip
 * and the sessions tab.
 *
 * Shorter than the usage pages' window on purpose: a rate is applied to individual
 * sessions, so it should reflect the model mix in use now rather than one a
 * month of history has flattened.
 */
export const RATE_WINDOW = '7d';

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
