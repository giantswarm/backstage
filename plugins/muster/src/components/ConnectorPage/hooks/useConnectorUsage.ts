import { useMemo } from 'react';
import { useApi } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { isAwaitingData } from '@giantswarm/backstage-plugin-ui-react';

import { McpUsage, musterApiRef } from '../../../apis';
import {
  MCP_USAGE_STALE_MS,
  useToolLatency,
  withToolLatency,
} from '../../McpUsage';
import { ServerPageRow } from '../../../lib/serverGrouping';
import {
  CONNECTOR_USAGE_DAYS,
  usageServerNames,
} from '../utils/connectorUsage';

export interface ConnectorUsage {
  /** Undefined until read, and where it could not be. */
  usage?: McpUsage;
  isLoading: boolean;
  /** Each tool's p95, read apart from the rest, is still on its way. */
  p95Loading?: boolean;
  error?: Error;
}

/**
 * Every caller's tool calls to one connector over the last `days` (by
 * default {@link CONNECTOR_USAGE_DAYS}), from muster's dispatch metrics
 * narrowed to its MCPServers: the connector's Usage tab and its Details'
 * calls read this one query, so they agree and share one request. With
 * `tool`, the calls of that one tool of the connector, for the tool page's
 * Usage tab. Read through the muster session, so disabled without one, and
 * for muster itself.
 */
export function useConnectorUsage(
  row: ServerPageRow | undefined,
  installation: string | undefined,
  {
    enabled,
    tool,
    days = CONNECTOR_USAGE_DAYS,
    withToolLatency: readToolLatency = false,
  }: {
    enabled: boolean;
    tool?: string;
    /** Also read each tool's p95, for a table that shows it. */
    withToolLatency?: boolean;
    /** The window, in days: a Usage tab's follows the `?window=` it opened with. */
    days?: number;
  },
): ConnectorUsage {
  const musterApi = useApi(musterApiRef);
  const servers = useMemo(() => (row ? usageServerNames(row) : []), [row]);
  const hours = days * 24;
  const { data, error, isPending, fetchStatus } = useQuery({
    queryKey: ['muster', 'mcp-usage', installation, hours, servers, tool],
    queryFn: () =>
      musterApi.getMcpUsage({ installation, hours, servers, tool }),
    enabled: enabled && Boolean(installation) && servers.length > 0,
    // The tab and Details reuse one answer rather than each mount asking
    // again, and a tool's Usage tab its own (a cache entry apart).
    staleTime: MCP_USAGE_STALE_MS,
  });
  // Narrowed to one tool, `/usage` answers its p95 itself.
  const toolLatency = useToolLatency({
    installation,
    hours,
    servers,
    enabled:
      enabled && readToolLatency && servers.length > 0 && tool === undefined,
  });
  const usage = useMemo(
    () => data && withToolLatency(data, toolLatency.latency),
    [data, toolLatency.latency],
  );
  return {
    usage,
    isLoading: isAwaitingData({ isPending, fetchStatus }),
    p95Loading: toolLatency.isLoading,
    error: (error as Error | null) ?? undefined,
  };
}
