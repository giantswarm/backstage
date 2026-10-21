import { useMemo } from 'react';
import { useApi } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { isAwaitingData } from '@giantswarm/backstage-plugin-ui-react';

import { McpUsage, musterApiRef } from '../../../apis';
import { ServerPageRow } from '../../../lib/serverGrouping';
import {
  CONNECTOR_USAGE_DAYS,
  usageServerNames,
} from '../utils/connectorUsage';

/**
 * How long a connector's usage stays fresh. Its buckets are whole days and
 * the read is several 30-day range queries, so the tab and Details reuse one
 * answer for a few minutes rather than each mount asking again, and a tool's
 * Usage tab its own (the read narrowed to that tool, a cache entry apart).
 */
const CONNECTOR_USAGE_STALE_MS = 5 * 60_000;

export interface ConnectorUsage {
  /** Undefined until read, and where it could not be. */
  usage?: McpUsage;
  isLoading: boolean;
  error?: Error;
}

/**
 * Every caller's tool calls to one connector over the last
 * {@link CONNECTOR_USAGE_DAYS} days, from muster's dispatch metrics narrowed
 * to its MCPServers: the connector's Usage tab and its Details' calls read
 * this one query, so they agree and share one request. With `tool`, the
 * calls of that one tool of the connector, for the tool page's Usage tab.
 * Read through the muster session, so disabled without one, and for muster
 * itself.
 */
export function useConnectorUsage(
  row: ServerPageRow | undefined,
  installation: string | undefined,
  { enabled, tool }: { enabled: boolean; tool?: string },
): ConnectorUsage {
  const musterApi = useApi(musterApiRef);
  const servers = useMemo(() => (row ? usageServerNames(row) : []), [row]);
  const hours = CONNECTOR_USAGE_DAYS * 24;
  const { data, error, isPending, fetchStatus } = useQuery({
    queryKey: ['muster', 'mcp-usage', installation, hours, servers, tool],
    queryFn: () =>
      musterApi.getMcpUsage({ installation, hours, servers, tool }),
    enabled: enabled && Boolean(installation) && servers.length > 0,
    staleTime: CONNECTOR_USAGE_STALE_MS,
  });
  return {
    usage: data,
    isLoading: isAwaitingData({ isPending, fetchStatus }),
    error: (error as Error | null) ?? undefined,
  };
}
