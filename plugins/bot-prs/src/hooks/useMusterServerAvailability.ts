import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import type { McpServerRuntime } from '@giantswarm/backstage-plugin-muster';

import { musterServersQueryKey } from '../lib/queryKeys';
import { useMusterPluginApi } from './useMusterPluginApi';

/**
 * Whether an installation's muster lists a server (`core_mcpserver_list`).
 * `unknown` while the read is in flight or failed; `missing` when muster
 * answered without it.
 */
export type MusterServerPresence = 'available' | 'missing' | 'unknown';

/**
 * The segment muster puts in a server's exposed names, which is what a caller
 * addresses it by: `family.name ?? toolPrefix ?? name` (registry.go). The CR
 * name differs from it whenever the server is declared with a `toolPrefix` --
 * `gazelle-mcp-marge` exposes `x_marge_<tool>` -- so the name alone is not the
 * thing to match.
 */
function exposedNameOf(server: McpServerRuntime): string {
  return server.family?.name ?? server.toolPrefix ?? server.name;
}

function presenceIn(
  servers: McpServerRuntime[] | null | undefined,
  serverName: string,
): MusterServerPresence {
  if (!servers) {
    return 'unknown';
  }
  return servers.some(server => exposedNameOf(server) === serverName)
    ? 'available'
    : 'missing';
}

export type MusterServerAvailability = {
  /** The installations whose muster lists the server. */
  available: string[];
  /** The installations whose muster answered without the server. */
  missing: string[];
  presenceOf: (installation: string) => MusterServerPresence;
  /** True while any installation's server list is still being read. */
  isLoading: boolean;
  /** The muster plugin is not installed: the server is reachable nowhere. */
  isUnavailable: boolean;
};

/**
 * The installations whose muster registers `serverName` as an MCPServer, read
 * per installation through the person's own muster session, which is also
 * what the server's tools go through. The same shape as the Agent Platform
 * plugin's hook of this name, kept here so the two plugins do not import each
 * other.
 */
export function useMusterServerAvailability(
  serverName: string,
  installations: string[],
): MusterServerAvailability {
  const musterApi = useMusterPluginApi();
  const queries = useQueries({
    queries: installations.map(installation => ({
      queryKey: musterServersQueryKey(installation),
      enabled: Boolean(musterApi),
      queryFn: () => musterApi!.listServers(installation),
      staleTime: 60_000,
      retry: false,
    })),
  });

  // Keyed on contents: `useQueries` returns fresh arrays every render and
  // callers derive `installations` inline.
  const signature = installations
    .map((installation, index) => {
      const query = queries[index];
      const presence = presenceIn(query.data?.mcpServers, serverName);
      return `${installation}:${presence}:${query.isLoading ? 'l' : ''}`;
    })
    .join('|');

  return useMemo(() => {
    const presence = new Map<string, MusterServerPresence>();
    let isLoading = false;
    for (const entry of signature ? signature.split('|') : []) {
      const [installation, state, loading] = entry.split(':');
      presence.set(installation, state as MusterServerPresence);
      isLoading = isLoading || loading === 'l';
    }
    const of = (installation: string): MusterServerPresence =>
      presence.get(installation) ?? 'unknown';
    return {
      available: installations.filter(name => of(name) === 'available'),
      missing: installations.filter(name => of(name) === 'missing'),
      presenceOf: of,
      isLoading: Boolean(musterApi) && isLoading,
      isUnavailable: !musterApi,
    };
    // `installations` is captured by the signature.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, musterApi]);
}
