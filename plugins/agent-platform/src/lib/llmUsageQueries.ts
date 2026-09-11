import {
  AgentgatewayCostCatalogLookupsTotal as CatalogLookups,
  AgentgatewayGenAiClientCostUsdTotal as Cost,
  AgentgatewayGenAiClientTokenUsage as TokenUsage,
  AgentgatewayGenAiServerRequestDuration as RequestDuration,
  AgentgatewayRequestsTotal as Requests,
} from '@giantswarm/backstage-plugin-gs';

/**
 * Every PromQL query the LLM usage views run, in one place.
 *
 * Built from the constants in the gs plugin's central metric registry rather
 * than from metric-name strings, which is what makes the dependency visible
 * from that registry — see the `mimir-metrics` skill.
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

export const llmUsageQueries = {
  /** Priced spend, split every way the page needs it. */
  cost: `sum by (${BY_AGENT_MODEL_TYPE}) (increase(${Cost.name}[${WINDOW}]))`,
  /** Tokens, same grouping — needs no price catalogue, so always trustworthy. */
  tokens: `sum by (${BY_AGENT_MODEL_TYPE}) (increase(${TokenUsage.name}_sum[${WINDOW}]))`,
  /** Model calls, from the duration histogram's count. */
  calls: `sum by (${BY_AGENT_MODEL}) (increase(${RequestDuration.name}_count[${WINDOW}]))`,
  durationP50: `histogram_quantile(0.50, sum by (le) (rate(${RequestDuration.name}_bucket[${WINDOW}])))`,
  durationP95: `histogram_quantile(0.95, sum by (le) (rate(${RequestDuration.name}_bucket[${WINDOW}])))`,
  requestsByStatus: `sum by (status) (increase(${Requests.name}{listener="${LLM_LISTENER}"}[${WINDOW}]))`,
  /**
   * Every model whose price lookup did not resolve. Empty is the healthy
   * state, and `> 0` keeps stale zero-valued series out of the table.
   */
  unpricedLookups: `sum by (gen_ai_request_model, gen_ai_response_model, status) (increase(${CatalogLookups.name}{status!="Exact"}[${WINDOW}])) > 0`,
} as const;

/**
 * The two range queries. `[1d]` rather than `[$WINDOW]`: each evaluation point
 * totals the day it closes, which is what a daily bar means.
 */
export const llmUsageRangeQueries = {
  costPerDayByModel: `sum by (gen_ai_response_model) (increase(${Cost.name}[1d]))`,
  tokensPerDayByType: `sum by (gen_ai_token_type) (increase(${TokenUsage.name}_sum[1d]))`,
} as const;

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
export function dailyRangeWindow(now: number = Date.now()): RangeWindow {
  const end = todayMidnight(now);
  const start = end - (WINDOW_DAYS - 2) * DAY_SECONDS;

  return { start: String(start), end: String(end), step: String(DAY_SECONDS) };
}

/**
 * How much of today has elapsed, as a PromQL duration, for the instant query
 * that supplies today's partial bar.
 *
 * `increase(...[<elapsed>])` evaluated now covers exactly midnight→now, so the
 * bar is today's real spend so far rather than a projection of it. Floored at
 * a minute because a zero-length range is not a legal PromQL duration, and
 * just after midnight there is nothing to show anyway.
 */
export function todayPartialRange(now: number = Date.now()): string {
  const elapsed = Math.floor(now / 1000) - todayMidnight(now);
  return `${Math.max(elapsed, 60)}s`;
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
 */
export function dailyWindowDayKeys(now: number = Date.now()): string[] {
  const { start, end } = dailyRangeWindow(now);
  const keys: string[] = [];
  // A range point at `t` covers the day before it.
  for (let at = Number(start); at <= Number(end); at += DAY_SECONDS) {
    keys.push(dayKey(at - DAY_SECONDS));
  }
  keys.push(dayKey(todayMidnight(now)));
  return keys;
}

/** Today's key, for the row {@link todayPartialRange} fills. */
export function todayDayKey(now: number = Date.now()): string {
  return dayKey(todayMidnight(now));
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
export function todayPartialQueries(range: string) {
  return {
    costByModel: `sum by (gen_ai_response_model) (increase(${Cost.name}[${range}]))`,
    tokensByType: `sum by (gen_ai_token_type) (increase(${TokenUsage.name}_sum[${range}]))`,
  };
}

/**
 * The window the $/token rate is averaged over, for the session detail strip
 * and the sessions tab.
 *
 * Shorter than the page's 30 days on purpose: a rate is applied to individual
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
export const tokenRateQueries = {
  cost: `sum by (agent_namespace, agent, gen_ai_response_model, gen_ai_token_type) (increase(${Cost.name}[${RATE_WINDOW}]))`,
  tokens: `sum by (agent_namespace, agent, gen_ai_response_model, gen_ai_token_type) (increase(${TokenUsage.name}_sum[${RATE_WINDOW}]))`,
} as const;
