import type {
  MimirMatrixSample,
  MimirMetricSample,
} from '@giantswarm/backstage-plugin-gs';
import type { AgentRow } from '../components/AgentsDataProvider';
import { deriveTokenRates, type TokenRates } from './costEstimate';
import { WINDOW_DAYS } from './llmUsageQueries';

/**
 * Reducers turning Mimir's answers into the rows the LLM usage views render.
 *
 * Every one of these is **total**: an unparseable sample is skipped, never
 * thrown on. A metrics page that breaks outright because one series carried a
 * value Prometheus calls `NaN` is worse than one that renders the rest — and
 * `NaN` is exactly what `histogram_quantile` answers for an empty histogram.
 * The same policy `normalizeSessionUsage` follows on the kagent wire.
 */

/** The gateway's own value for "the caller IP matched no known Pod". */
export const UNKNOWN_AGENT_LABEL = 'unknown';

export type TokenTypeTotals = {
  input: number;
  output: number;
  inputCacheRead: number;
  inputCacheWrite: number;
  /** Anything the gateway starts reporting that we do not know a name for. */
  other: number;
};

export type LlmAgentRow = {
  id: string;
  namespace: string;
  /** The raw `agent` label. */
  agent: string;
  /** What to show: the matched `Agent` CR's display name, or a fallback. */
  label: string;
  href?: string;
  tokens: number;
  calls: number;
  /**
   * Priced spend, or `undefined` when the gateway recorded no cost for this
   * agent at all.
   *
   * The gateway records **nothing** for a model missing from its price
   * catalogue, so "no cost series" and "genuinely free" are one state in the
   * metric — and `$0.00` would assert the second. `undefined` renders as `—`;
   * the unpriced-models table is what resolves the ambiguity.
   */
  costUsd: number | undefined;
  /** Percentage of the window's total spend. `undefined` when nothing was priced. */
  sharePct: number | undefined;
};

export type LlmModelRow = {
  id: string;
  model: string;
  tokens: number;
  calls: number;
  /** As {@link LlmAgentRow.costUsd}: `undefined` when nothing was priced. */
  costUsd: number | undefined;
  /** Blended price of a million tokens of this model's traffic. */
  usdPerMillion: number | undefined;
  avgTokensPerCall: number | undefined;
  sharePct: number | undefined;
};

export type UnpricedModelRow = {
  id: string;
  requestModel: string;
  responseModel: string;
  status: string;
  lookups: number;
};

/**
 * One day of a stacked series: the day key, plus one numeric key per series.
 *
 * An index signature admitting `string | number` rather than an intersection
 * with `Record<string, number>` — that intersection is uninhabitable, because
 * `day` contradicts the index signature and TypeScript rejects every literal.
 * Read a series value through {@link seriesValue}, which narrows it back.
 */
export type LlmDailyEntry = { day: string; [series: string]: string | number };

/** One series' value for a day, or `0` — never the `day` string. */
function seriesValue(row: LlmDailyEntry, key: string): number {
  const value = row[key];
  return typeof value === 'number' ? value : 0;
}

export type LlmDailySeries = {
  rows: LlmDailyEntry[];
  /** The data keys present in `rows`, ranked by total so stacks read sensibly. */
  series: string[];
};

export type LlmReliability = {
  totalRequests: number;
  errorRequests: number;
  errorRatePct: number | undefined;
  rateLimited: number;
  p50Seconds: number | undefined;
  p95Seconds: number | undefined;
};

export type LlmUsageTotals = {
  /** As {@link LlmAgentRow.costUsd}: `undefined` when nothing was priced. */
  costUsd: number | undefined;
  tokens: number;
  calls: number;
  agents: number;
  models: number;
  usdPerMillion: number | undefined;
  avgTokensPerCall: number | undefined;
  /** Cache reads over all cache-eligible input tokens, as a percentage. */
  cacheReadSharePct: number | undefined;
};

export type LlmUsage = {
  windowDays: number;
  totals: LlmUsageTotals;
  tokenTypes: TokenTypeTotals;
  byAgent: LlmAgentRow[];
  byModel: LlmModelRow[];
  costPerDay: LlmDailySeries;
  tokensPerDay: LlmDailySeries;
  reliability: LlmReliability;
  unpricedModels: UnpricedModelRow[];
  rates: TokenRates;
};

/**
 * A Prometheus sample value, or `undefined`.
 *
 * Values arrive as strings and include `NaN`, `+Inf` and `-Inf` — all three of
 * which `Number()` happily produces, and any of which would poison a running
 * total. Only a finite number counts.
 */
function sampleValue(raw: string | undefined): number | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function instantValue(sample: MimirMetricSample): number | undefined {
  return sampleValue(sample.value?.[1]);
}

/** Sum an instant vector, grouping by whatever `key` reads off each sample. */
function sumBy(
  samples: MimirMetricSample[] | undefined,
  key: (labels: Record<string, string>) => string,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const sample of samples ?? []) {
    const value = instantValue(sample);
    if (value === undefined) {
      continue;
    }
    const labels = sample.metric ?? {};
    const group = key(labels);
    totals.set(group, (totals.get(group) ?? 0) + value);
  }
  return totals;
}

function sumValues(totals: Map<string, number>): number {
  let sum = 0;
  for (const value of totals.values()) {
    sum += value;
  }
  return sum;
}

function toRecord(totals: Map<string, number>): Record<string, number> {
  return Object.fromEntries(totals);
}

/**
 * A total, or `undefined` when the vector held no series at all.
 *
 * The distinction only matters for cost: zero is a real answer for a counter
 * that was observed, and no answer at all is what an unpriced model produces.
 */
function optionalTotal(
  totals: Map<string, number>,
  key: string,
): number | undefined {
  return totals.has(key) ? totals.get(key) : undefined;
}

function optionalSum(totals: Map<string, number>): number | undefined {
  return totals.size === 0 ? undefined : sumValues(totals);
}

function percent(
  part: number | undefined,
  whole: number | undefined,
): number | undefined {
  if (part === undefined || whole === undefined) {
    return undefined;
  }
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) {
    return undefined;
  }
  return (part / whole) * 100;
}

function perMillion(
  costUsd: number | undefined,
  tokens: number,
): number | undefined {
  if (costUsd === undefined || tokens <= 0 || costUsd <= 0) {
    return undefined;
  }
  return (costUsd / tokens) * 1_000_000;
}

function ratePerCall(tokens: number, calls: number): number | undefined {
  if (calls <= 0) {
    return undefined;
  }
  return tokens / calls;
}

/** `agent_namespace|agent`, the key both the cost and token vectors share. */
function agentKey(labels: Record<string, string>): string {
  return `${labels.agent_namespace ?? ''}|${labels.agent ?? ''}`;
}

function modelKey(labels: Record<string, string>): string {
  return labels.gen_ai_response_model ?? '';
}

function tokenTypeKey(labels: Record<string, string>): string {
  // An empty string is meaningful: it is what a metric *without* the
  // `gen_ai_token_type` label reduces to, which is how `deriveTokenRates`
  // detects that only a blended rate is available.
  return labels.gen_ai_token_type ?? '';
}

export function reduceTokenTypes(
  totals: Record<string, number>,
): TokenTypeTotals {
  const known = {
    input: totals.input ?? 0,
    output: totals.output ?? 0,
    inputCacheRead: totals.input_cache_read ?? 0,
    inputCacheWrite: totals.input_cache_write ?? 0,
  };
  const accounted =
    known.input + known.output + known.inputCacheRead + known.inputCacheWrite;
  const all = Object.values(totals).reduce((acc, v) => acc + (v ?? 0), 0);

  return { ...known, other: Math.max(all - accounted, 0) };
}

/**
 * Cache reads over every cache-eligible input token.
 *
 * The figure that says whether prompt caching is paying off: cache reads are
 * priced at a fraction of fresh input, so this falling towards zero is a bill
 * about to rise. `undefined` when there is no input traffic at all, which is
 * not the same as caching being broken.
 */
export function cacheReadShare(types: TokenTypeTotals): number | undefined {
  const eligible = types.input + types.inputCacheRead + types.inputCacheWrite;
  return percent(types.inputCacheRead, eligible);
}

/**
 * Join the gateway's per-agent totals against the fleet's `Agent` CRs.
 *
 * The gateway labels a call with the **ServiceAccount of the calling pod**, so
 * the match is `agent_namespace`/`agent` against the CR's namespace and
 * technical name — not kagent's encoded agent id, which is what the
 * session-derived table joins on. Verified on `gazelle` (2026-09-10): kagent
 * names each agent's Deployment ServiceAccount after the agent, and every
 * `agent_namespace`/`agent` pair the gateway reported resolved to an `Agent`
 * CR by namespace and name.
 *
 * Three fallbacks, none of which drops a row: `unknown` is the gateway's own
 * "no Pod matched" and reads as "Unattributed"; a label that matches no CR is
 * shown as `namespace/agent`, unlinked, because the agent may have been
 * deleted since and its spend is still in the totals above; and a row with no
 * namespace at all keeps the bare agent name. Dropping any of them would make
 * the table disagree with the tiles.
 */
export function reduceByAgent(options: {
  cost: MimirMetricSample[] | undefined;
  tokens: MimirMetricSample[] | undefined;
  calls: MimirMetricSample[] | undefined;
  agents: AgentRow[];
  installation: string | undefined;
  hrefFor: (row: AgentRow) => string | undefined;
  unknownLabel: string;
}): LlmAgentRow[] {
  const { cost, tokens, calls, agents, installation, hrefFor, unknownLabel } =
    options;

  const costByAgent = sumBy(cost, agentKey);
  const tokensByAgent = sumBy(tokens, agentKey);
  const callsByAgent = sumBy(calls, agentKey);
  const totalCost = optionalSum(costByAgent);

  const index = new Map<string, AgentRow>();
  for (const agent of agents) {
    if (installation !== undefined && agent.installation !== installation) {
      continue;
    }
    index.set(`${agent.namespace}|${agent.technicalName}`, agent);
  }

  const keys = new Set([
    ...costByAgent.keys(),
    ...tokensByAgent.keys(),
    ...callsByAgent.keys(),
  ]);

  const rows: LlmAgentRow[] = [];
  for (const key of keys) {
    const [namespace = '', agent = ''] = key.split('|');
    const matched = index.get(key);
    const costUsd = optionalTotal(costByAgent, key);

    let label: string;
    if (matched) {
      label = matched.name;
    } else if (agent === UNKNOWN_AGENT_LABEL || agent === '') {
      label = unknownLabel;
    } else {
      label = namespace ? `${namespace}/${agent}` : agent;
    }

    rows.push({
      id: key,
      namespace,
      agent,
      label,
      href: matched ? hrefFor(matched) : undefined,
      tokens: tokensByAgent.get(key) ?? 0,
      calls: callsByAgent.get(key) ?? 0,
      costUsd,
      sharePct: percent(costUsd, totalCost),
    });
  }

  return rows.sort(
    (a, b) =>
      (b.costUsd ?? 0) - (a.costUsd ?? 0) ||
      b.tokens - a.tokens ||
      a.label.localeCompare(b.label),
  );
}

/**
 * Roll the same three vectors up by the model the provider answered with.
 *
 * Unlike the session-derived breakdown this replaces, the model here is the one
 * each call actually ran on — read off `gen_ai_response_model` at the gateway,
 * not off the agent's current `ModelConfig`. So it stays correct when an
 * agent's model changes mid-window.
 */
export function reduceByModel(options: {
  cost: MimirMetricSample[] | undefined;
  tokens: MimirMetricSample[] | undefined;
  calls: MimirMetricSample[] | undefined;
  unknownLabel: string;
}): LlmModelRow[] {
  const { cost, tokens, calls, unknownLabel } = options;

  const costByModel = sumBy(cost, modelKey);
  const tokensByModel = sumBy(tokens, modelKey);
  const callsByModel = sumBy(calls, modelKey);
  const totalCost = optionalSum(costByModel);

  const keys = new Set([
    ...costByModel.keys(),
    ...tokensByModel.keys(),
    ...callsByModel.keys(),
  ]);

  const rows: LlmModelRow[] = [];
  for (const key of keys) {
    const costUsd = optionalTotal(costByModel, key);
    const modelTokens = tokensByModel.get(key) ?? 0;
    const modelCalls = callsByModel.get(key) ?? 0;

    rows.push({
      id: key || 'unknown-model',
      model: key || unknownLabel,
      tokens: modelTokens,
      calls: modelCalls,
      costUsd,
      usdPerMillion: perMillion(costUsd, modelTokens),
      avgTokensPerCall: ratePerCall(modelTokens, modelCalls),
      sharePct: percent(costUsd, totalCost),
    });
  }

  return rows.sort(
    (a, b) =>
      (b.costUsd ?? 0) - (a.costUsd ?? 0) ||
      b.tokens - a.tokens ||
      a.model.localeCompare(b.model),
  );
}

export function reduceUnpricedModels(
  samples: MimirMetricSample[] | undefined,
): UnpricedModelRow[] {
  const rows: UnpricedModelRow[] = [];
  for (const sample of samples ?? []) {
    const lookups = instantValue(sample);
    if (lookups === undefined || lookups <= 0) {
      continue;
    }
    const labels = sample.metric ?? {};
    const requestModel = labels.gen_ai_request_model ?? '—';
    const responseModel = labels.gen_ai_response_model ?? '—';
    const status = labels.status ?? '—';
    rows.push({
      id: `${requestModel}|${responseModel}|${status}`,
      requestModel,
      responseModel,
      status,
      lookups,
    });
  }
  return rows.sort((a, b) => b.lookups - a.lookups);
}

/**
 * Requests and errors on the LLM listener, plus the two latency quantiles.
 *
 * `histogram_quantile` answers `NaN` for a histogram with no observations, so
 * both quantiles come back `undefined` on a quiet installation rather than as
 * a confident zero.
 */
export function reduceReliability(options: {
  requestsByStatus: MimirMetricSample[] | undefined;
  p50: MimirMetricSample[] | undefined;
  p95: MimirMetricSample[] | undefined;
}): LlmReliability {
  const { requestsByStatus, p50, p95 } = options;

  const byStatus = sumBy(requestsByStatus, labels => labels.status ?? '');
  const totalRequests = sumValues(byStatus);

  let errorRequests = 0;
  let rateLimited = 0;
  for (const [status, count] of byStatus) {
    if (!/^2\d\d$/.test(status)) {
      errorRequests += count;
    }
    if (status === '429') {
      rateLimited += count;
    }
  }

  return {
    totalRequests,
    errorRequests,
    errorRatePct: percent(errorRequests, totalRequests),
    rateLimited,
    p50Seconds: p50?.length ? instantValue(p50[0]) : undefined,
    p95Seconds: p95?.length ? instantValue(p95[0]) : undefined,
  };
}

const DAY_MS = 86400 * 1000;

/**
 * Turn a matrix into one row per day, with one key per series.
 *
 * **A point is labelled by the day it covers, not the day it closes.** Each
 * evaluation lands on a UTC midnight and `increase(...[1d])` there totals the
 * preceding 24 hours, so the value at midnight of the 5th is the 4th's. Off by
 * one here would silently shift every bar in the chart by a day, which is
 * invisible in the chart and wrong in every reading of it.
 */
export function reduceDaily(
  samples: MimirMatrixSample[] | undefined,
  options: {
    label: (labels: Record<string, string>) => string;
    /**
     * The exact days to render, oldest first — normally
     * `dailyWindowDayKeys()`, so the axis is the window the page claims rather
     * than however much history the metric happens to have.
     *
     * Omitted, the range is derived from the data instead, which is only
     * useful for a caller that has no window of its own.
     */
    days?: string[];
  },
): LlmDailySeries {
  const byDay = new Map<string, Record<string, number>>();
  const seriesTotals = new Map<string, number>();

  for (const sample of samples ?? []) {
    const key = options.label(sample.metric ?? {});
    for (const [at, raw] of sample.values ?? []) {
      const value = sampleValue(raw);
      if (value === undefined || !Number.isFinite(at)) {
        continue;
      }
      const day = new Date(at * 1000 - DAY_MS).toISOString().slice(0, 10);
      const row = byDay.get(day) ?? {};
      row[key] = (row[key] ?? 0) + value;
      byDay.set(day, row);
      seriesTotals.set(key, (seriesTotals.get(key) ?? 0) + value);
    }
  }

  const series = [...seriesTotals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key]) => key);

  const days = options.days ?? [...byDay.keys()].sort();
  const rows = options.days
    ? options.days.map(day => densify(day, byDay.get(day), series))
    : fillDays(days, byDay, series);

  return { rows, series };
}

/** One row with every series key present, zero where the day held none. */
function densify(
  day: string,
  values: Record<string, number> | undefined,
  series: string[],
): LlmDailyEntry {
  const row: LlmDailyEntry = { day };
  for (const key of series) {
    row[key] = values?.[key] ?? 0;
  }
  return row;
}

/**
 * Fill every calendar day between the first and last with zeros.
 *
 * Mimir answers densely for a range query, so this is the belt to that braces —
 * except for the case that does happen: a series that started mid-window has
 * points only from then on, and a chart handed a sparse frame silently
 * compresses the timeline, drawing N bars that do not mean N days. The
 * session-derived charts guard the same failure with `fillMissingDays`.
 */
function fillDays(
  days: string[],
  byDay: Map<string, Record<string, number>>,
  series: string[],
): LlmDailyEntry[] {
  if (days.length === 0) {
    return [];
  }

  const first = Date.parse(`${days[0]}T00:00:00Z`);
  const last = Date.parse(`${days[days.length - 1]}T00:00:00Z`);
  if (Number.isNaN(first) || Number.isNaN(last)) {
    return [];
  }

  const rows: LlmDailyEntry[] = [];
  for (let at = first; at <= last; at += DAY_MS) {
    const day = new Date(at).toISOString().slice(0, 10);
    rows.push(densify(day, byDay.get(day), series));
  }
  return rows;
}

/** Assemble everything the two Mimir views read. */
export function buildLlmUsage(options: {
  cost: MimirMetricSample[] | undefined;
  tokens: MimirMetricSample[] | undefined;
  calls: MimirMetricSample[] | undefined;
  requestsByStatus: MimirMetricSample[] | undefined;
  p50: MimirMetricSample[] | undefined;
  p95: MimirMetricSample[] | undefined;
  unpricedLookups: MimirMetricSample[] | undefined;
  costPerDay: MimirMatrixSample[] | undefined;
  tokensPerDay: MimirMatrixSample[] | undefined;
  agents: AgentRow[];
  installation: string | undefined;
  hrefFor: (row: AgentRow) => string | undefined;
  unknownAgentLabel: string;
  unknownModelLabel: string;
  /** The days both charts render, from `dailyWindowDayKeys()`. Last is today. */
  days: string[];
  /** Today's key, whose row the partial vectors below fill. */
  today: string;
  costToday: MimirMetricSample[] | undefined;
  tokensToday: MimirMetricSample[] | undefined;
}): LlmUsage {
  const { cost, tokens, calls } = options;

  const costByType = toRecord(sumBy(cost, tokenTypeKey));
  const tokensByType = toRecord(sumBy(tokens, tokenTypeKey));
  const tokenTypes = reduceTokenTypes(tokensByType);

  const totalCost = optionalSum(sumBy(cost, () => 'all'));
  const totalTokens = sumValues(sumBy(tokens, () => 'all'));
  const totalCalls = sumValues(sumBy(calls, () => 'all'));

  const byAgent = reduceByAgent({
    cost,
    tokens,
    calls,
    agents: options.agents,
    installation: options.installation,
    hrefFor: options.hrefFor,
    unknownLabel: options.unknownAgentLabel,
  });
  const byModel = reduceByModel({
    cost,
    tokens,
    calls,
    unknownLabel: options.unknownModelLabel,
  });

  const modelLabel = (labels: Record<string, string>) =>
    labels.gen_ai_response_model || options.unknownModelLabel;
  const typeLabel = (labels: Record<string, string>) =>
    labels.gen_ai_token_type || 'unknown';

  const costPerDay = applyTodayPartial(
    reduceDaily(options.costPerDay, {
      label: modelLabel,
      days: options.days,
    }),
    { day: options.today, samples: options.costToday, label: modelLabel },
  );
  const tokensPerDay = applyTodayPartial(
    reduceDaily(options.tokensPerDay, {
      label: typeLabel,
      days: options.days,
    }),
    { day: options.today, samples: options.tokensToday, label: typeLabel },
  );

  return {
    windowDays: WINDOW_DAYS,
    totals: {
      costUsd: totalCost,
      tokens: totalTokens,
      calls: totalCalls,
      // Counted from the rows rather than with a PromQL `count(count by …)`:
      // the rows are already here, and one fewer query is one fewer thing that
      // can disagree with the table underneath the tile.
      agents: byAgent.length,
      models: byModel.length,
      usdPerMillion: perMillion(totalCost, totalTokens),
      avgTokensPerCall: ratePerCall(totalTokens, totalCalls),
      cacheReadSharePct: cacheReadShare(tokenTypes),
    },
    tokenTypes,
    byAgent,
    byModel,
    costPerDay,
    tokensPerDay,
    reliability: reduceReliability({
      requestsByStatus: options.requestsByStatus,
      p50: options.p50,
      p95: options.p95,
    }),
    unpricedModels: reduceUnpricedModels(options.unpricedLookups),
    rates: deriveTokenRates(costByType, tokensByType),
  };
}

/** Whether the window holds anything worth rendering. */
export function hasAnyLlmUsage(usage: LlmUsage | undefined): boolean {
  if (!usage) {
    return false;
  }
  return usage.totals.tokens > 0 || usage.totals.calls > 0;
}

/**
 * Overlay today's partial totals onto the last row of a daily series.
 *
 * The range query stops at yesterday on purpose — see `dailyRangeWindow` — so
 * today arrives from a separate instant query scoped to elapsed-time-since-
 * midnight. That makes today's bar **real spend so far**, not a day-long
 * extrapolation of a few hours, which is the whole reason the two are queried
 * apart.
 *
 * A model that first appeared today brings a new series key with it, so every
 * earlier row is re-filled with a zero for it and the series are re-ranked —
 * otherwise the stack would carry a key most rows do not have, and recharts
 * renders a missing key as a gap rather than as nothing.
 */
export function applyTodayPartial(
  daily: LlmDailySeries,
  options: {
    day: string;
    samples: MimirMetricSample[] | undefined;
    label: (labels: Record<string, string>) => string;
  },
): LlmDailySeries {
  const today = sumBy(options.samples, labels => options.label(labels));
  if (today.size === 0) {
    return daily;
  }

  const totals = new Map<string, number>();
  for (const key of daily.series) {
    totals.set(
      key,
      daily.rows.reduce((acc, row) => acc + seriesValue(row, key), 0),
    );
  }
  for (const [key, value] of today) {
    totals.set(key, (totals.get(key) ?? 0) + value);
  }

  const series = [...totals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key]) => key);

  const rows = daily.rows.map(row => {
    const values = Object.fromEntries(
      series.map(key => [
        key,
        row.day === options.day ? (today.get(key) ?? 0) : seriesValue(row, key),
      ]),
    );
    return densify(row.day, values, series);
  });

  return { rows, series };
}

/**
 * Cap a daily series at `limit` keys, pooling the rest under `otherLabel`.
 *
 * The categorical palette is eight hues in a validated order and stops there:
 * a ninth colour would have to be generated, would land at an unverified
 * distance from an existing slot, and no check covers it. So the ninth model
 * becomes part of "Other" instead — which also keeps a stack of thirty thin
 * bands from claiming to be readable.
 *
 * `rows` already carries every key, so pooling is a sum per row rather than a
 * re-query, and the chart's total per day is unchanged.
 */
export function foldSeries(
  daily: LlmDailySeries,
  limit: number,
  otherLabel: string,
): LlmDailySeries {
  if (daily.series.length <= limit) {
    return daily;
  }

  const kept = daily.series.slice(0, limit);
  const pooled = daily.series.slice(limit);

  return {
    series: [...kept, otherLabel],
    rows: daily.rows.map(row => {
      const folded: LlmDailyEntry = { day: row.day };
      for (const key of kept) {
        folded[key] = seriesValue(row, key);
      }
      folded[otherLabel] = pooled.reduce(
        (acc, key) => acc + seriesValue(row, key),
        0,
      );
      return folded;
    }),
  };
}
