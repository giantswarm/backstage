import { DEFAULT_USAGE_WINDOW_DAYS } from '@giantswarm/backstage-plugin-agent-platform-common';

import { MCPServer } from '../../../lib/k8s';
import { ServerPageRow } from '../../../lib/serverGrouping';

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
