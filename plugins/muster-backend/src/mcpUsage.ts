import { MusterInstallationConfig, MusterMcpClient } from './MusterMcpClient';
import { finiteValue, parsePromToolText, PromSeries } from './promText';

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

function sumPoints(series: PromSeries[]): number {
  let total = 0;
  for (const s of series) {
    const value = s.points[0]?.value;
    if (value !== undefined && Number.isFinite(value)) {
      total += value;
    }
  }
  return total;
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

  let byOutcomeOverTime: PromSeries[];
  let byToolOutcome: PromSeries[];
  let byServerOutcome: PromSeries[];
  let p95Overall: PromSeries[];
  let p95ByTool: PromSeries[];
  try {
    [byOutcomeOverTime, byToolOutcome, byServerOutcome, p95Overall, p95ByTool] =
      await Promise.all([
        runQuery(RANGE_TOOL, {
          query: `sum by (outcome) (increase(${METRIC_CALLS}[${step}]))`,
          // RFC3339, not Unix seconds: mcp-prometheus documents both but its
          // deployed versions only parse RFC3339.
          start: new Date(startSeconds * 1000).toISOString(),
          end: new Date(endSeconds * 1000).toISOString(),
          step,
        }),
        runQuery(QUERY_TOOL, {
          query: `sum by (tool, outcome) (increase(${METRIC_CALLS}[${range}]))`,
        }),
        runQuery(QUERY_TOOL, {
          query: `sum by (mcpserver_name, outcome) (increase(${METRIC_CALLS}[${range}]))`,
        }),
        runQuery(QUERY_TOOL, {
          query: `histogram_quantile(0.95, sum by (le) (rate(${METRIC_DURATION}[${range}])))`,
        }),
        runQuery(QUERY_TOOL, {
          query: `histogram_quantile(0.95, sum by (tool, le) (rate(${METRIC_DURATION}[${range}])))`,
        }),
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

  // Per-tool rollup.
  const toolRows = new Map<string, McpUsageToolRow>();
  for (const series of byToolOutcome) {
    const tool = series.labels.tool;
    const value = series.points[0]?.value;
    if (!tool || value === undefined || !Number.isFinite(value)) {
      continue;
    }
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
  for (const series of p95ByTool) {
    const row = series.labels.tool && toolRows.get(series.labels.tool);
    if (row) {
      row.p95_seconds = finiteValue(series) ?? null;
    }
  }

  // Per-server rollup.
  const serverRows = new Map<string, McpUsageServerRow>();
  for (const series of byServerOutcome) {
    const server = series.labels.mcpserver_name;
    const value = series.points[0]?.value;
    if (!server || value === undefined || !Number.isFinite(value)) {
      continue;
    }
    const row = serverRows.get(server) ?? { server, calls: 0, errors: 0 };
    row.calls += value;
    if (series.labels.outcome !== 'ok') {
      row.errors += value;
    }
    serverRows.set(server, row);
  }

  const totalCalls = sumPoints(
    byToolOutcome.filter(series => series.labels.outcome !== undefined),
  );
  const totalErrors = sumPoints(
    byToolOutcome.filter(series => series.labels.outcome !== 'ok'),
  );

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
      p95_seconds: finiteValue(p95Overall[0]) ?? null,
      distinct_tools: toolRows.size,
    },
    top_tools: [...toolRows.values()]
      .sort((a, b) => b.calls - a.calls)
      .slice(0, TOP_TOOLS_LIMIT),
    servers: [...serverRows.values()].sort((a, b) => b.calls - a.calls),
  };
}
