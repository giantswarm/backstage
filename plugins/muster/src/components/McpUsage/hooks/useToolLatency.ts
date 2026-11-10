import { useApi } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { isAwaitingData } from '@giantswarm/backstage-plugin-ui-react';

import { McpToolLatency, McpUsage, musterApiRef } from '../../../apis';

/**
 * How long a usage read stays fresh: its buckets are whole days and the read
 * costs Mimir seconds, so a remount or a revisit reuses it. The backend
 * caches it for as long.
 */
export const MCP_USAGE_STALE_MS = 5 * 60_000;

export interface ToolLatency {
  latency?: McpToolLatency;
  /** Still reading: the p95 column shows placeholders, not "—". */
  isLoading: boolean;
}

/**
 * Every tool's p95 over the window, from `/usage/tool-latency`: read beside
 * `/usage` so the figures do not wait for the slowest query. A failed read
 * leaves the column empty and the rest of the view as it is.
 */
export function useToolLatency({
  installation,
  hours,
  servers = [],
  enabled,
}: {
  installation: string | undefined;
  hours: number;
  servers?: readonly string[];
  enabled: boolean;
}): ToolLatency {
  const musterApi = useApi(musterApiRef);
  const { data, isPending, fetchStatus } = useQuery({
    queryKey: [
      'muster',
      'mcp-tool-latency',
      installation,
      hours,
      // The backend's own cache entry: one per set of servers, in any order.
      [...new Set(servers)].sort(),
    ],
    queryFn: () =>
      musterApi.getMcpToolLatency({ installation, hours, servers }),
    enabled: enabled && Boolean(installation),
    staleTime: MCP_USAGE_STALE_MS,
  });
  return {
    latency: data,
    isLoading: isAwaitingData({ isPending, fetchStatus }),
  };
}

/**
 * The usage with each tool row's p95 from the latency read. A row the latency
 * read does not name, or a usage narrowed to one tool, keeps its own.
 */
export function withToolLatency(
  usage: McpUsage,
  latency: McpToolLatency | undefined,
): McpUsage {
  if (!latency?.available) {
    return usage;
  }
  const byTool = new Map(latency.tools.map(row => [row.tool, row.p95_seconds]));
  return {
    ...usage,
    top_tools: usage.top_tools.map(row =>
      byTool.has(row.tool)
        ? { ...row, p95_seconds: byTool.get(row.tool) ?? null }
        : row,
    ),
  };
}
