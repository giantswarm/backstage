import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { isAwaitingData } from '@giantswarm/backstage-plugin-ui-react';
import {
  musterInstallationsQueryKey,
  type McpServerRuntime,
} from '@giantswarm/backstage-plugin-muster';

import { musterServersQueryKey } from '../lib/queryKeys';
import { useMusterPluginApi } from './useMusterPluginApi';

/**
 * Whether an installation's muster lists a server (`core_mcpserver_list`).
 * `unknown` while the read is in flight or failed; `missing` when muster
 * answered without it. `sharedIdentity`, only when the caller asks for a
 * server reached as the person: the portal's muster entry for the
 * installation has no per-user sign-in (`requiresAuth: false` on
 * `/installations`), so muster-backend refuses the server's tools rather than
 * run them under muster's own identity, shared by every portal user. A
 * `missing` server wins over it: a per-user sign-in alone would not help.
 */
export type MusterServerPresence =
  'available' | 'missing' | 'unknown' | 'sharedIdentity';

/**
 * The segment muster puts in a server's exposed names, which is what a caller
 * addresses it by: `family.name ?? toolPrefix ?? name` (registry.go). The CR
 * name differs from it whenever the server is declared with a `toolPrefix` --
 * `mcp-marge` exposes `x_marge_<tool>` -- so the name alone is not the
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
  /**
   * The installations whose muster runs calls under its shared identity, so
   * the server's tools are refused there (only with `asPerson`).
   */
  sharedIdentity: string[];
  presenceOf: (installation: string) => MusterServerPresence;
  /** True while any installation's server list is still being read. */
  isLoading: boolean;
  /** The muster plugin is not installed: the server is reachable nowhere. */
  isUnavailable: boolean;
};

export type MusterServerAvailabilityOptions = {
  /**
   * The server's tools act for the person, so an installation whose muster
   * has no per-user sign-in is `sharedIdentity`, never `available`. Until
   * `/installations` has answered, and when it failed, every installation is
   * `unknown`: nothing is offered that muster-backend may refuse.
   */
  asPerson?: boolean;
};

/**
 * The installations on which a manager (agent-manager, cluster-manager) can
 * be reached: the ones whose muster registers it as an MCPServer. Read per
 * installation through the person's own muster session (`musterApi.listServers`),
 * which is also what the manager's tools will go through — so an installation
 * offered here is one the person can actually reach the server on.
 */
export function useMusterServerAvailability(
  serverName: string,
  installations: string[],
  { asPerson = false }: MusterServerAvailabilityOptions = {},
): MusterServerAvailability {
  const musterApi = useMusterPluginApi();
  // The muster plugin's own read of `/installations`, under its key, so the
  // page header's installation selector and this share one cache entry.
  const installationInfo = useQuery({
    queryKey: musterInstallationsQueryKey(),
    enabled: Boolean(musterApi) && asPerson && installations.length > 0,
    queryFn: () => musterApi!.listInstallations(),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const shared = new Set(
    (installationInfo.data?.installations ?? [])
      .filter(info => info.requiresAuth === false)
      .map(info => info.name),
  );
  const isReadingInstallations = asPerson && isAwaitingData(installationInfo);
  // Without an answer, whether an installation runs as the person is unknown.
  const isInstallationsUnknown = asPerson && !installationInfo.data;
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
      const listed = presenceIn(query.data?.mcpServers, serverName);
      let presence: MusterServerPresence = listed;
      if (listed !== 'missing' && shared.has(installation)) {
        presence = 'sharedIdentity';
      } else if (listed === 'available' && isInstallationsUnknown) {
        presence = 'unknown';
      }
      const loading = isAwaitingData(query) || isReadingInstallations;
      return `${installation}:${presence}:${loading ? 'l' : ''}`;
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
      sharedIdentity: installations.filter(
        name => of(name) === 'sharedIdentity',
      ),
      presenceOf: of,
      isLoading: Boolean(musterApi) && isLoading,
      isUnavailable: !musterApi,
    };
    // `installations` is captured by the signature.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, musterApi]);
}
