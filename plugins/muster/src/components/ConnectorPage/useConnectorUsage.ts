import { useMemo } from 'react';
import { useApi } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { DEFAULT_USAGE_WINDOW_DAYS } from '@giantswarm/backstage-plugin-agent-platform-common';
import { isAwaitingData } from '@giantswarm/backstage-plugin-ui-react';

import { McpUsage, musterApiRef } from '../../apis';
import { MCPServer } from '../../lib/k8s';
import { ServerPageRow } from '../../lib/serverGrouping';

/**
 * The window a connector's usage covers on its page, its Details and its
 * tools' pages: the Usage screen's default 30 days, so a connector's figures
 * match `/usage/connectors` as it opens.
 */
export const CONNECTOR_USAGE_DAYS = DEFAULT_USAGE_WINDOW_DAYS;

/** The MCPServers a page's row stands for: the server, or a family's instances. */
export function rowServers(row: ServerPageRow): MCPServer[] {
  if (row.kind === 'server') {
    return [row.server];
  }
  if (row.kind === 'family') {
    return row.servers;
  }
  return [];
}

/**
 * The MCPServer names muster's metrics count a row's calls under, sorted so
 * every page reading them shares one cache entry. None for muster itself,
 * whose own tools are not dispatched to a connector and so never counted.
 */
export function usageServerNames(row: ServerPageRow): string[] {
  return [...new Set(rowServers(row).map(server => server.getName()))].sort();
}

export interface ConnectorUsage {
  /** Undefined until read, and where it could not be. */
  usage?: McpUsage;
  isLoading: boolean;
  error?: Error;
}

/**
 * Every caller's tool calls to one connector over the last
 * {@link CONNECTOR_USAGE_DAYS} days, from muster's dispatch metrics narrowed
 * to its MCPServers: the connector's Usage tab, its Details' calls and its
 * tools' pages read this one query, so they agree and cost one request. Read
 * through the muster session, so disabled without one, and for muster itself.
 */
export function useConnectorUsage(
  row: ServerPageRow | undefined,
  installation: string | undefined,
  { enabled }: { enabled: boolean },
): ConnectorUsage {
  const musterApi = useApi(musterApiRef);
  const servers = useMemo(() => (row ? usageServerNames(row) : []), [row]);
  const hours = CONNECTOR_USAGE_DAYS * 24;
  const { data, error, isPending, fetchStatus } = useQuery({
    queryKey: ['muster', 'mcp-usage', installation, hours, servers],
    queryFn: () => musterApi.getMcpUsage({ installation, hours, servers }),
    enabled: enabled && Boolean(installation) && servers.length > 0,
  });
  return {
    usage: data,
    isLoading: isAwaitingData({ isPending, fetchStatus }),
    error: (error as Error | null) ?? undefined,
  };
}
