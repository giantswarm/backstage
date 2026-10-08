import { useCallback, useMemo } from 'react';
import { isAwaitingData } from '@giantswarm/backstage-plugin-ui-react';
import { ToolSummary } from '../../apis';
import { useToolCatalogue } from '../shared';
import { MCPServer } from '../../lib/k8s';
import { ServerPageRow, selectRepresentative } from '../../lib/serverGrouping';
import {
  serverPrefixInfos,
  shortToolName,
  toolsForRow,
} from '../../lib/toolGrouping';

export interface ServerTools {
  /** The row's tools, by name; undefined until they are read. */
  tools?: ToolSummary[];
  /** The catalogue hit its limit, so the list may be incomplete. */
  truncated: boolean;
  isLoading: boolean;
  error?: Error;
  /** A tool's name without the prefix of the server offering it. */
  shortName: (name: string) => string;
}

/**
 * The tools a server page lists: the row's share of the installation's tool
 * catalogue -- the read the servers list counts and searches with, so a row's
 * "3 of 42 match" is the list its Tools tab opens with, for a family, a
 * singular server and muster alike. One cached request per installation,
 * shared with the servers list. Read through the muster session,
 * so disabled without one.
 */
export function useServerTools(
  row: ServerPageRow,
  servers: MCPServer[],
  installation: string,
  { enabled }: { enabled: boolean },
): ServerTools {
  const { data, error, isPending, fetchStatus } = useToolCatalogue(
    installation,
    enabled,
  );
  const isLoading = isAwaitingData({ isPending, fetchStatus });

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
  const shortName = useCallback(
    (name: string) => shortToolName(name, prefixes),
    [prefixes],
  );

  return useMemo(
    () => ({
      tools,
      truncated: data?.truncated ?? false,
      isLoading,
      error: (error as Error | null) ?? undefined,
      shortName,
    }),
    [tools, data, isLoading, error, shortName],
  );
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
