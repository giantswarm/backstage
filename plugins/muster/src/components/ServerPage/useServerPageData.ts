import { useMemo } from 'react';
import { useApi } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { musterApiRef, ToolSummary } from '../../apis';
import { useToolCatalogue } from '../shared';
import { MCPServer } from '../../lib/k8s';
import { ServerPageRow, selectRepresentative } from '../../lib/serverGrouping';
import {
  serverPrefixInfos,
  shortToolName,
  toolsForRow,
} from '../../lib/toolGrouping';

/** A singular server's tools, as the servers page's accordion reads them. */
const SERVER_TOOLS_LIMIT = 200;

export interface ServerTools {
  /** The row's tools, by name; undefined until they are read. */
  tools?: ToolSummary[];
  /** The list hit its limit, so it may be incomplete. */
  truncated: boolean;
  isLoading: boolean;
  error?: Error;
  /** A tool's name without the prefix of the server offering it. */
  shortName: (name: string) => string;
}

/**
 * The tools a server page lists, read through the muster session -- disabled
 * without one, since the catalogue is session-scoped. A singular server's are
 * one `filter_tools` for its prefix and muster's are its core tools, cheap
 * enough to read on every tab for the Tools count. A family's need the whole
 * catalogue, so they are read only where they are shown (`includeFamily`: the
 * Tools tab and a tool page).
 */
export function useServerTools(
  row: ServerPageRow,
  servers: MCPServer[],
  installation: string,
  { enabled, includeFamily }: { enabled: boolean; includeFamily: boolean },
): ServerTools {
  const musterApi = useApi(musterApiRef);
  const pattern =
    row.kind === 'server' ? `${row.server.getToolNamePrefix()}_*` : '';

  const scoped = useQuery({
    queryKey: ['muster', 'server-tools', installation, pattern],
    queryFn: () =>
      musterApi.filterTools({
        installation,
        pattern,
        limit: SERVER_TOOLS_LIMIT,
      }),
    enabled: enabled && row.kind === 'server',
  });
  const core = useQuery({
    queryKey: ['muster', 'core-tools', installation],
    queryFn: () => musterApi.listCoreTools(installation),
    enabled: enabled && row.kind === 'core',
  });
  const catalogue = useToolCatalogue(
    installation,
    enabled && includeFamily && row.kind === 'family',
  );
  let query;
  if (row.kind === 'server') {
    query = scoped;
  } else if (row.kind === 'core') {
    query = core;
  } else {
    query = catalogue;
  }
  const { data, isLoading, error } = query;

  const prefixes = useMemo(() => serverPrefixInfos(servers), [servers]);
  const tools = useMemo(
    () =>
      data
        ? // The pattern `x_foo_*` also matches a server exposed as
          // `x_foo_bar`; attribution by the longest prefix drops those.
          toolsForRow(data.tools ?? [], row, prefixes).sort((a, b) =>
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
