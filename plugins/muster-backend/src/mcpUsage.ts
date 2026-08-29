import { MusterInstallationConfig, MusterMcpClient } from './MusterMcpClient';
import { parsePromToolText, PromSeries } from './promText';

/**
 * MCP usage statistics derived from muster's own Prometheus metrics
 * (`muster_downstream_tool_calls_total` /
 * `muster_downstream_tool_call_duration_seconds`), queried through the
 * prometheus MCP server federated behind the same muster installation —
 * no separate Prometheus access path needed.
 */

export interface McpUsageBucket {
  /** Bucket start, ISO timestamp. */
  start: string;
  ok: number;
  error: number;
  error_result: number;
}

export interface McpUsageToolRow {
  tool: string;
  calls: number;
  errors: number;
  p95_seconds: number | null;
}

export interface McpUsageServerRow {
  server: string;
  calls: number;
  errors: number;
}

export interface McpUsageResponse {
  available: boolean;
  /** Human-readable reason when `available` is false. */
  reason?: string;
  /** Which prometheus MCP server/tool pair answered the queries. */
  source?: { server: string; tool: string };
  range_hours: number;
  step_hours: number;
  buckets: McpUsageBucket[];
  totals: {
    calls: number;
    errors: number;
    error_ratio: number | null;
    p95_seconds: number | null;
    distinct_tools: number;
  };
  top_tools: McpUsageToolRow[];
  servers: McpUsageServerRow[];
}

/**
 * mcp-prometheus servers declare the `prometheus` tool family, so muster
 * exposes their tools under the family name with a `management_cluster`
 * routing parameter — the same names whether one or twenty-four prometheus
 * servers are registered. The plain `x_<server>_` prefix is the fallback for
 * a server that does not declare the family.
 */
const FAMILY_PREFIX = 'x_prometheus_';
const QUERY_TOOL = 'execute_query';
const RANGE_TOOL = 'execute_range_query';

const METRIC_CALLS = 'muster_downstream_tool_calls_total';
const METRIC_DURATION = 'muster_downstream_tool_call_duration_seconds_bucket';

/** How many tools the top-tools table carries. */
const TOP_TOOLS_LIMIT = 15;

interface ServerListPayload {
  mcpServers?: Array<{ name?: string; state?: string }> | null;
}

/**
 * Pick the prometheus MCP server that fronts this installation's own
 * metrics. An explicit `prometheusServer` config wins; otherwise prefer the
 * `<installation>-mcp-prometheus` naming convention, then any unambiguous
 * prometheus-ish server.
 */
export function pickPrometheusServer(
  servers: Array<{ name?: string; state?: string }>,
  installation: MusterInstallationConfig,
): string | undefined {
  if (installation.prometheusServer) {
    return installation.prometheusServer;
  }
  const names = servers
    .map(server => server.name)
    .filter((name): name is string => Boolean(name));

  const conventional = names.find(
    name => name === `${installation.name}-mcp-prometheus`,
  );
  if (conventional) {
    return conventional;
  }

  const prometheusLike = names.filter(name => /prometheus/i.test(name));
  if (prometheusLike.length === 1) {
    return prometheusLike[0];
  }
  // Several candidates (a hub muster federating many MCs): the one prefixed
  // with the installation name is the local instance.
  return prometheusLike.find(name => name.startsWith(installation.name));
}

/** Sum of every finite sample across all series (a range-query rollup). */
function sumPoints(series: PromSeries[]): number {
  let total = 0;
  for (const s of series) {
    for (const point of s.points) {
      if (Number.isFinite(point.value)) {
        total += point.value;
      }
    }
  }
  return total;
}

function parseLe(le: string | undefined): number | undefined {
  if (le === undefined) {
    return undefined;
  }
  if (le === '+Inf' || le === 'Inf') {
    return Infinity;
  }
  const parsed = Number(le);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/**
 * Sum histogram-bucket increases per (group, le) across every time step.
 * Prometheus `_bucket` series are cumulative in `le`, and both `increase()`
 * and summation over time preserve that, so the totals stay a valid
 * cumulative histogram per group.
 */
function bucketTotals(
  series: PromSeries[],
  groupLabel?: string,
): Map<string, Map<number, number>> {
  const groups = new Map<string, Map<number, number>>();
  for (const s of series) {
    const le = parseLe(s.labels.le);
    if (le === undefined) {
      continue;
    }
    const key = groupLabel ? (s.labels[groupLabel] ?? '') : '';
    const buckets = groups.get(key) ?? new Map<number, number>();
    let count = buckets.get(le) ?? 0;
    for (const point of s.points) {
      if (Number.isFinite(point.value)) {
        count += point.value;
      }
    }
    buckets.set(le, count);
    groups.set(key, buckets);
  }
  return groups;
}

/**
 * The Prometheus histogram_quantile algorithm over cumulative bucket
 * totals, run client-side. Computing the quantile here (from per-step
 * `increase()` sums) instead of via `histogram_quantile(rate(...[24h]))`
 * keeps every query step-sized — Mimir splits step-aligned range queries,
 * while instant queries with a multi-hour lookback go to the long-range
 * store path, which is exactly what breaks when a store-gateway degrades.
 */
export function quantileFromBuckets(
  q: number,
  buckets: Map<number, number>,
): number | null {
  const entries = [...buckets.entries()].sort((a, b) => a[0] - b[0]);
  if (entries.length === 0) {
    return null;
  }
  const total = entries[entries.length - 1][1];
  if (!(total > 0)) {
    return null;
  }
  const rank = q * total;
  let prevLe = 0;
  let prevCount = 0;
  for (const [le, count] of entries) {
    if (count >= rank) {
      if (!Number.isFinite(le)) {
        // The quantile falls in the +Inf bucket: cap at the highest
        // finite bound, like Prometheus does.
        return prevLe;
      }
      if (count === prevCount) {
        return le;
      }
      return (
        prevLe + (le - prevLe) * ((rank - prevCount) / (count - prevCount))
      );
    }
    if (Number.isFinite(le)) {
      prevLe = le;
    }
    prevCount = count;
  }
  return prevLe;
}

function unavailable(hours: number, reason: string): McpUsageResponse {
  return {
    available: false,
    reason,
    range_hours: hours,
    step_hours: hours,
    buckets: [],
    totals: {
      calls: 0,
      errors: 0,
      error_ratio: null,
      p95_seconds: null,
      distinct_tools: 0,
    },
    top_tools: [],
    servers: [],
  };
}

export async function getMcpUsage(
  client: MusterMcpClient,
  installation: MusterInstallationConfig,
  callOptions: { authToken?: string },
  hours: number,
): Promise<McpUsageResponse> {
  const listed = (await client.callTool(
    'core_mcpserver_list',
    {},
    callOptions,
  )) as ServerListPayload | null;
  const servers = listed?.mcpServers ?? [];

  const promServer = pickPrometheusServer(servers, installation);
  if (!promServer) {
    return unavailable(
      hours,
      'No prometheus MCP server is registered on this installation, so usage metrics cannot be queried.',
    );
  }

  // Bucket size: hourly up to two days, daily beyond.
  const stepHours = hours <= 48 ? 1 : 24;
  const stepSeconds = stepHours * 3600;
  const nowSeconds = Math.floor(Date.now() / 1000);
  // Align the window to whole steps so bucket edges are stable across reloads.
  const endSeconds = Math.ceil(nowSeconds / stepSeconds) * stepSeconds;
  const startSeconds = endSeconds - hours * 3600;
  const range = `${hours}h`;
  const step = `${stepHours}h`;

  const runQuery = async (
    tool: typeof QUERY_TOOL | typeof RANGE_TOOL,
    args: Record<string, unknown>,
  ): Promise<PromSeries[]> => {
    // Family naming first (the GS deployment shape), plain prefix fallback.
    try {
      const text = (await client.callTool(
        `${FAMILY_PREFIX}${tool}`,
        { ...args, management_cluster: promServer },
        callOptions,
      )) as string;
      return parsePromToolText(String(text));
    } catch (familyError) {
      try {
        const text = (await client.callTool(
          `x_${promServer}_${tool}`,
          args,
          callOptions,
        )) as string;
        return parsePromToolText(String(text));
      } catch {
        throw familyError;
      }
    }
  };

  // Every aggregate is derived from step-split RANGE queries with a
  // step-sized lookback, never from instant queries with a range-long
  // lookback: Mimir's query-frontend splits range queries into short
  // subqueries, while `increase(x[24h])` at an instant needs one long-range
  // read from the store-gateway path — which is exactly what degrades when a
  // store-gateway has a bad day (observed on gazelle: [1h] fine, [12h]+
  // returning 500 while the equivalent range query kept working).
  const rangeQuery = (query: string): Promise<PromSeries[]> =>
    runQuery(RANGE_TOOL, {
      query,
      // RFC3339, not Unix seconds: mcp-prometheus documents both but its
      // deployed versions only parse RFC3339.
      start: new Date(startSeconds * 1000).toISOString(),
      end: new Date(endSeconds * 1000).toISOString(),
      step,
    });
  // The secondary rollups degrade to empty on failure instead of taking the
  // whole view down.
  const optional = (promise: Promise<PromSeries[]>): Promise<PromSeries[]> =>
    promise.catch(() => []);

  let byOutcomeOverTime: PromSeries[];
  let byToolOutcome: PromSeries[];
  let byServerOutcome: PromSeries[];
  let latencyBuckets: PromSeries[];
  let latencyBucketsByTool: PromSeries[];
  try {
    [
      byOutcomeOverTime,
      byToolOutcome,
      byServerOutcome,
      latencyBuckets,
      latencyBucketsByTool,
    ] = await Promise.all([
      rangeQuery(`sum by (outcome) (increase(${METRIC_CALLS}[${step}]))`),
      optional(
        rangeQuery(
          `sum by (tool, outcome) (increase(${METRIC_CALLS}[${step}]))`,
        ),
      ),
      optional(
        rangeQuery(
          `sum by (mcpserver_name, outcome) (increase(${METRIC_CALLS}[${step}]))`,
        ),
      ),
      optional(
        rangeQuery(`sum by (le) (increase(${METRIC_DURATION}[${step}]))`),
      ),
      optional(
        rangeQuery(`sum by (tool, le) (increase(${METRIC_DURATION}[${step}]))`),
      ),
    ]);
  } catch (error) {
    return unavailable(
      hours,
      `Querying prometheus MCP server '${promServer}' failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  // Time buckets: seed every step in the window so the chart reads as a full
  // range, then fill from the range-query samples. A sample at timestamp T
  // covers (T - step, T]; label the bucket by its start for display.
  const buckets = new Map<number, McpUsageBucket>();
  for (
    let ts = startSeconds + stepSeconds;
    ts <= endSeconds;
    ts += stepSeconds
  ) {
    buckets.set(ts, {
      start: new Date((ts - stepSeconds) * 1000).toISOString(),
      ok: 0,
      error: 0,
      error_result: 0,
    });
  }
  for (const series of byOutcomeOverTime) {
    const outcome = series.labels.outcome;
    if (outcome !== 'ok' && outcome !== 'error' && outcome !== 'error_result') {
      continue;
    }
    for (const point of series.points) {
      const bucket = buckets.get(point.ts);
      if (bucket && Number.isFinite(point.value)) {
        bucket[outcome] += point.value;
      }
    }
  }

  // Per-tool rollup (sum every step's increase per series).
  const toolRows = new Map<string, McpUsageToolRow>();
  for (const series of byToolOutcome) {
    const tool = series.labels.tool;
    if (!tool) {
      continue;
    }
    const value = sumPoints([series]);
    const row = toolRows.get(tool) ?? {
      tool,
      calls: 0,
      errors: 0,
      p95_seconds: null,
    };
    row.calls += value;
    if (series.labels.outcome !== 'ok') {
      row.errors += value;
    }
    toolRows.set(tool, row);
  }
  for (const [toolName, toolBuckets] of bucketTotals(
    latencyBucketsByTool,
    'tool',
  )) {
    const row = toolRows.get(toolName);
    if (row) {
      row.p95_seconds = quantileFromBuckets(0.95, toolBuckets);
    }
  }

  // Per-server rollup.
  const serverRows = new Map<string, McpUsageServerRow>();
  for (const series of byServerOutcome) {
    const server = series.labels.mcpserver_name;
    if (!server) {
      continue;
    }
    const value = sumPoints([series]);
    const row = serverRows.get(server) ?? { server, calls: 0, errors: 0 };
    row.calls += value;
    if (series.labels.outcome !== 'ok') {
      row.errors += value;
    }
    serverRows.set(server, row);
  }

  // Totals come from the (required) outcome buckets, so they stay correct
  // even when the optional per-tool rollup degraded to empty.
  const totalCalls = sumPoints(byOutcomeOverTime);
  const totalErrors = sumPoints(
    byOutcomeOverTime.filter(series => series.labels.outcome !== 'ok'),
  );
  const overallBuckets = bucketTotals(latencyBuckets).get('');

  return {
    available: true,
    source: { server: promServer, tool: `${FAMILY_PREFIX}${QUERY_TOOL}` },
    range_hours: hours,
    step_hours: stepHours,
    buckets: [...buckets.values()],
    totals: {
      calls: totalCalls,
      errors: totalErrors,
      error_ratio: totalCalls > 0 ? totalErrors / totalCalls : null,
      p95_seconds: overallBuckets
        ? quantileFromBuckets(0.95, overallBuckets)
        : null,
      distinct_tools: toolRows.size,
    },
    top_tools: [...toolRows.values()]
      .sort((a, b) => b.calls - a.calls)
      .slice(0, TOP_TOOLS_LIMIT),
    servers: [...serverRows.values()].sort((a, b) => b.calls - a.calls),
  };
}
