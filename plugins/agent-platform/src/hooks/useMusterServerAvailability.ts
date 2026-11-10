import { useMemo } from 'react';
import {
  useQueries,
  useQuery,
  useQueryClient,
  type Query,
} from '@tanstack/react-query';
import {
  isAwaitingData,
  pollingQueryOptions,
} from '@giantswarm/backstage-plugin-ui-react';
import {
  musterInstallationsQueryKey,
  type McpServerRuntime,
} from '@giantswarm/backstage-plugin-muster';

import { musterServersQueryKey } from '../lib/queryKeys';
import { useMusterPluginApi } from './useMusterPluginApi';

/**
 * Whether an installation's muster lists a server (`core_mcpserver_list`).
 * `unknown` while the read is in flight or failed; `missing` when muster
 * answered without it. `sharedIdentity`: the server is reached as the person
 * (the default) and the portal's muster entry for the installation has no
 * per-user sign-in (`requiresAuth: false` on `/installations`), so
 * muster-backend refuses the server's tools rather than run them under
 * muster's own identity, shared by every portal user. A caller treats it like
 * an absent server and says why (`sharedIdentityReason`). A `missing` server
 * wins over it: a per-user sign-in alone would not help.
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

/** The first read again after a 503, doubling with every further one. */
const UNAVAILABLE_BACKOFF_MS = 60_000;
const UNAVAILABLE_BACKOFF_MAX_MS = 10 * 60_000;

function isUnavailable(query: Query<unknown, Error>): boolean {
  return (
    query.state.status === 'error' &&
    (query.state.error as { status?: unknown } | null)?.status === 503
  );
}

/**
 * The query's `errorUpdateCount` at its last successful read: the count only
 * grows, so the failures in a row are the count since then.
 */
const errorsBeforeLastSuccess = new WeakMap<Query<unknown, Error>, number>();

/**
 * When to read an installation's list again after it failed: a 503 (its
 * muster did not answer, or muster-backend knows it cannot be reached from
 * the portal) after {@link UNAVAILABLE_BACKOFF_MS}, doubling with each 503 in
 * a row up to {@link UNAVAILABLE_BACKOFF_MAX_MS}. Any other failure is not
 * read again by itself. A successful read ends it and starts the doubling
 * over.
 */
export function unavailableBackoff(
  query: Query<unknown, Error>,
): number | false {
  const { status, errorUpdateCount } = query.state;
  if (status === 'success') {
    errorsBeforeLastSuccess.set(query, errorUpdateCount);
    return false;
  }
  if (!isUnavailable(query)) {
    return false;
  }
  const inARow = errorUpdateCount - (errorsBeforeLastSuccess.get(query) ?? 0);
  return Math.min(
    UNAVAILABLE_BACKOFF_MS * 2 ** Math.max(inARow - 1, 0),
    UNAVAILABLE_BACKOFF_MAX_MS,
  );
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
   * the server's tools are refused there (not with `asPerson: false`).
   */
  sharedIdentity: string[];
  presenceOf: (installation: string) => MusterServerPresence;
  /**
   * Whether the read that decides the installation's presence has failed
   * (its server list, or the installations as the person): an `unknown`
   * presence that will not settle by waiting. `false` while a read is in
   * flight or has answered.
   */
  failedOf: (installation: string) => boolean;
  /** True while any installation's server list is still being read. */
  isLoading: boolean;
  /** The muster plugin is not installed: the server is reachable nowhere. */
  isUnavailable: boolean;
  /**
   * Reads the lists again where there is no answer yet (`unknown`), say once
   * the person signed in to muster there in another tab; settles when the
   * reads have.
   */
  recheck: () => Promise<void>;
};

export type MusterServerAvailabilityOptions = {
  /**
   * The server's tools act for the person (the default): an installation
   * whose muster has no per-user sign-in is `sharedIdentity`, never
   * `available`. Until `/installations` has answered, and when it failed,
   * every installation is `unknown`: nothing is offered that muster-backend
   * may refuse. `false` only for a server whose tools run without the person,
   * as muster's own core tools do.
   */
  asPerson?: boolean;
};

/**
 * The installations on which a manager (agent-manager, cluster-manager,
 * model-manager, workspace-manager) can be reached as the person: the ones whose muster registers it as an MCPServer. Read per
 * installation through the person's own muster session (`musterApi.listServers`),
 * which is also what the manager's tools will go through — so an installation
 * offered here is one the person can actually reach the server on.
 */
export function useMusterServerAvailability(
  serverName: string,
  installations: string[],
  { asPerson = true }: MusterServerAvailabilityOptions = {},
): MusterServerAvailability {
  const musterApi = useMusterPluginApi();
  const queryClient = useQueryClient();
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
  // The portal cannot reach their muster: their lists are not asked for once
  // `/installations` says so, and their presence is `unknown` whatever a
  // read made before that answered.
  const unreachable = new Set(
    (installationInfo.data?.installations ?? [])
      .filter(info => info.reachable === false)
      .map(info => info.name),
  );
  const isReadingInstallations = asPerson && isAwaitingData(installationInfo);
  // Without an answer, whether an installation runs as the person is unknown.
  const isInstallationsUnknown = asPerson && !installationInfo.data;
  const queries = useQueries({
    queries: installations.map(installation => ({
      queryKey: musterServersQueryKey(installation),
      enabled: Boolean(musterApi) && !unreachable.has(installation),
      queryFn: () => musterApi!.listServers(installation),
      staleTime: 60_000,
      retry: false,
      // Several components of a page read these lists: a 503 is read again by
      // the backoff, not by every one that mounts. Other failures still are.
      retryOnMount: (query: Query<unknown, Error>) => !isUnavailable(query),
      ...pollingQueryOptions(unavailableBackoff, { refetchOnVisible: false }),
    })),
  });

  // Keyed on contents: `useQueries` returns fresh arrays every render and
  // callers derive `installations` inline.
  const signature = installations
    .map((installation, index) => {
      const query = queries[index];
      const listed = unreachable.has(installation)
        ? 'unknown'
        : presenceIn(query.data?.mcpServers, serverName);
      let presence: MusterServerPresence = listed;
      if (listed !== 'missing' && shared.has(installation)) {
        presence = 'sharedIdentity';
      } else if (listed === 'available' && isInstallationsUnknown) {
        presence = 'unknown';
      }
      const loading =
        (isAwaitingData(query) && !unreachable.has(installation)) ||
        isReadingInstallations;
      const failed =
        !loading &&
        (unreachable.has(installation) ||
          query.isError ||
          (asPerson && installationInfo.isError));
      return `${installation}:${presence}:${loading ? 'l' : ''}:${failed ? 'f' : ''}`;
    })
    .join('|');

  return useMemo(() => {
    const presence = new Map<string, MusterServerPresence>();
    const failed = new Set<string>();
    let isLoading = false;
    for (const entry of signature ? signature.split('|') : []) {
      const [installation, state, loading, failure] = entry.split(':');
      presence.set(installation, state as MusterServerPresence);
      isLoading = isLoading || loading === 'l';
      if (failure === 'f') {
        failed.add(installation);
      }
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
      failedOf: (installation: string) => failed.has(installation),
      isLoading: Boolean(musterApi) && isLoading,
      isUnavailable: !musterApi,
      recheck: async () => {
        const unknown = installations.filter(name => of(name) === 'unknown');
        await Promise.all([
          ...unknown.map(installation =>
            queryClient.invalidateQueries({
              queryKey: musterServersQueryKey(installation),
            }),
          ),
          ...(isInstallationsUnknown && unknown.length > 0
            ? [
                queryClient.invalidateQueries({
                  queryKey: musterInstallationsQueryKey(),
                }),
              ]
            : []),
        ]);
      },
    };
    // `installations` is captured by the signature.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, musterApi, queryClient, isInstallationsUnknown]);
}
