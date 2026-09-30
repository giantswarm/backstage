import { useMemo } from 'react';
import { useApi } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { musterApiRef, ToolSummary } from '../../apis';
import { MCPServer } from '../../lib/k8s';
import { ServerPageRow, selectRepresentative } from '../../lib/serverGrouping';
import {
  serverPrefixInfos,
  shortToolName,
  toolsForRow,
} from '../../lib/toolGrouping';

/**
 * The installation's whole tool catalogue, one request per installation. The
 * key and limit are the Tool explorer's browse query's, so the two share a
 * cache entry.
 */
const INSTALLATION_TOOLS_LIMIT = 2000;

export interface ServerTools {
  /** The row's tools, by name; undefined until they are read. */
  tools?: ToolSummary[];
  /** The catalogue hit the limit, so the list may be incomplete. */
  truncated: boolean;
  isLoading: boolean;
  error?: Error;
  /** A tool's name without the prefix of the server offering it. */
  shortName: (name: string) => string;
}

/**
 * The tools a server page lists, read through the muster session. Disabled
 * without one: the catalogue is session-scoped, and the request would only
 * fail.
 */
export function useServerTools(
  row: ServerPageRow,
  servers: MCPServer[],
  installation: string,
  enabled: boolean,
): ServerTools {
  const musterApi = useApi(musterApiRef);
  const { data, isLoading, error } = useQuery({
    queryKey: ['muster', 'tools-browse', installation],
    queryFn: () =>
      musterApi.filterTools({ installation, limit: INSTALLATION_TOOLS_LIMIT }),
    enabled,
  });

  const prefixes = useMemo(() => serverPrefixInfos(servers), [servers]);
  const tools = useMemo(
    () =>
      data
        ? toolsForRow(data.tools ?? [], row, prefixes).sort((a, b) =>
            a.name.localeCompare(b.name),
          )
        : undefined,
    [data, row, prefixes],
  );

  return {
    tools,
    truncated: data?.truncated ?? false,
    isLoading,
    error: (error as Error | null) ?? undefined,
    shortName: (name: string) => shortToolName(name, prefixes),
  };
}

/**
 * The server a row's shared configuration, resources and prompts are read
 * for: the singular server itself, or a family's representative instance (the
 * active installation's own, else a connected one). None for muster.
 */
export function representativeServer(
  row: ServerPageRow,
  installation: string,
): { server: MCPServer; qualified: boolean } | undefined {
  if (row.kind === 'server') {
    return { server: row.server, qualified: true };
  }
  if (row.kind === 'family') {
    return selectRepresentative(row.servers, installation);
  }
  return undefined;
}

/**
 * The per-session resource and prompt counts muster reports for one server
 * (`core_mcpserver_list`, the query the servers page's runtime block shares).
 * Absent rather than 0 when the server exposes none, and on aggregators older
 * than muster#1099 -- a tab without a count shows none, never 0.
 */
export function useCapabilityCounts(
  installation: string,
  serverName: string | undefined,
  enabled: boolean,
): { resourcesCount?: number; promptsCount?: number } {
  const musterApi = useApi(musterApiRef);
  const { data } = useQuery({
    queryKey: ['muster', 'servers', installation],
    queryFn: () => musterApi.listServers(installation),
    enabled: enabled && Boolean(serverName),
  });
  const runtime = data?.mcpServers?.find(s => s.name === serverName);
  return {
    resourcesCount: runtime?.resourcesCount,
    promptsCount: runtime?.promptsCount,
  };
}
