import { ReactNode, useMemo } from 'react';
import type { QueryKey } from '@tanstack/react-query';
import { QueryClient, QueryClientConfig } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import {
  createPluginQueryPersister,
  shouldPersistQuery,
} from '@giantswarm/backstage-plugin-kubernetes-react';

// Keep entries in cache for an hour and persist them to localStorage, mirroring
// the gs fleet-list client (Clusters/Deployments). Together with a non-zero
// staleTime this gives the Agents/ModelConfig lists real caching: navigating
// between tabs (or reloading) shows the last-known agents immediately instead of
// blanking and re-querying the whole fleet — and a previously-loaded
// installation's rows don't vanish just because a background refetch was
// triggered and one cluster transiently failed.
const gcTime = 1000 * 60 * 60;
const maxAge = gcTime;

/**
 * How often the cache may be written to localStorage, raised from the library
 * default of 1s.
 *
 * Every write dehydrates the *whole* agent-platform cache and `JSON.stringify`s
 * it synchronously on the main thread. That was near-free while these queries
 * only ran on page visits, but the agents list now polls — as often as every 5s
 * for an installation with a converging agent — so at the default throttle a
 * large fleet's cache would be re-serialised and rewritten for as long as a tab
 * stays open. Persistence here exists to make a *reload* cheap, not to be
 * durable to the second, so coalescing writes costs nothing that matters.
 */
const PERSIST_THROTTLE_MS = 1000 * 30;

/**
 * This plugin's own localStorage key. The gs, flux and agent-platform providers
 * used to share the library default and so merged their caches into one blob
 * (see `LEGACY_SHARED_PERSISTER_KEY` in kubernetes-react): every reload of an
 * Agent Platform page rehydrated 4.9 MB, most of it flux's Kustomization lists,
 * and wrote them back. Each plugin now has its own key, with a size guard. A
 * change to what a query stores still calls for a new *query* key, not a new
 * persister key: the blob under this one outlives releases (backstage#2264).
 */
export const AGENT_PLATFORM_PERSISTER_KEY = 'agent-platform-react-query-cache';

/**
 * The persisted cache's schema version: the kagent API the readers expect.
 *
 * `PersistQueryClientProvider` compares it with the `buster` stored in the
 * blob on restore and discards the whole blob when they differ, so a release
 * that changes the CR schema the readers understand — `kagent.dev/v1alpha3
 * AgentTemplate` to `api.kagent.dev/v1alpha3 Agent` — starts from an empty
 * cache instead of rehydrating rows written by the previous portal. The query
 * keys carry group, version and plural too, which keeps an old entry from ever
 * being *read* as the new shape; the buster is what stops it being kept and
 * rewritten for the rest of its `maxAge`. Bump it with the next schema change.
 */
export const AGENT_PLATFORM_CACHE_BUSTER = 'api.kagent.dev/v1alpha3';

/**
 * Query keys whose data belongs to one *user* rather than to the fleet, and which
 * must therefore never be written to localStorage.
 *
 * Everything else cached here (Agents, ModelConfigs, the kagent installation
 * list, and the gs installation inventory under `['gs', 'installation-inventory',
 * …]` — which platform components each installation runs, one `GET /apis` per
 * installation, read by every tab's provider under this client) is installation
 * state: identical for every user, and safe to persist.
 * kagent sessions are not — the rows are one user's chat titles, the identity
 * probe caches their subject (an email address), and a session's tasks are the
 * whole conversation, including tool arguments and results.
 *
 * Persisting them would be wrong twice over on a shared workstation: the data
 * outlives sign-out on disk, and `PersistQueryClientProvider` would rehydrate the
 * previous user's sessions for the next one under the same origin and key — which
 * `staleTime` would not even refetch if the entry is under a minute old.
 *
 * `session-tasks` has a second, independent reason: **size**. A real 4-turn
 * session's tasks were ~500 KB against this plugin's persisted budget of 2 MB
 * (the persister drops the oldest entries beyond it), so a handful of opened
 * conversations would push out the fleet lists this persistence exists for in
 * the first place.
 */
const USER_SCOPED_RESOURCES = new Set([
  'sessions',
  'me',
  'session',
  'session-tasks',
  'session-states',
  // A per-user breakdown of what someone ran, which agents they spent on and
  // which tools they reached for. The same rule as the rows above, with the
  // sharpest reason to hold it: it is a behavioural profile, and small enough
  // that nothing but the rule keeps it off the disk.
  'session-usage',
  // One person's model spend, in total and per agent: the backend answers it
  // `no-store`, and a shared workstation must not rehydrate it for the next
  // person.
  'model-cost',
  // The namespaces of the Agents one person may list: their tenants.
  'agent-namespaces',
]);

function isUserScopedQueryKey(queryKey: QueryKey): boolean {
  const [scope, subsystem, resource] = queryKey as unknown[];
  // Everything read through the muster gateway is one person's view: a
  // toolset resolution is toolset ∩ that person's session catalogue, the
  // catalogue itself lists only the servers they have signed in to, and the
  // muster plugin's own `auth://status` and pending-sign-in entries (its hooks
  // run under this client when rendered inline on the Tools step and the
  // agent page) describe their session. The muster plugin never persists
  // any of it, and neither does this client — see `lib/queryKeys.ts`.
  if (scope === 'muster') {
    return true;
  }
  return (
    scope === 'agent-platform' &&
    subsystem === 'kagent' &&
    typeof resource === 'string' &&
    USER_SCOPED_RESOURCES.has(resource)
  );
}

/** Exported for testing: the persistence filter applied below. */
export function shouldDehydrateAgentPlatformQuery(queryKey: QueryKey): boolean {
  return !isUserScopedQueryKey(queryKey);
}

const queryClientConfig: QueryClientConfig = {
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      // Cached list data is treated as fresh for a minute, so switching tabs
      // or remounting reuses it without an immediate background refetch (the
      // refetch is what could error on a single cluster and drop its rows).
      staleTime: 60_000,
      retry: (failureCount, error) => {
        const name = (error as Error).name;
        if (
          name === 'RejectedError' ||
          name === 'NotFoundError' ||
          name === 'UnauthorizedError' ||
          name === 'ForbiddenError' ||
          name === 'ServiceUnavailableError'
        ) {
          return false;
        }
        return failureCount <= 2;
      },
      // Capped exponential backoff so a persistently failing cluster (e.g. an
      // unreachable MC) is retried with increasing spacing instead of
      // hammered, and never waits longer than 30s between attempts.
      retryDelay: attempt => Math.min(1000 * 2 ** attempt, 30000),
      gcTime,
    },
  },
};

/**
 * One live client for every mount of this provider -- the three tab routers
 * and the section's header control (the installation scope selector, which
 * reads the installation inventory). They used to get a client each and only
 * met through the persisted copy in localStorage, written at most every 30 s:
 * a cold load probed the inventory once per client, and a tab switch dropped
 * whatever the previous tab had read in the last half minute. Sharing the
 * client (as the muster plugin does) makes the inventory one set of requests
 * per page load and a tab switch a cache read.
 */
const queryClient = new QueryClient(queryClientConfig);

/**
 * Reads the restored Kubernetes lists (Agents, ModelConfigs and the rest, all
 * keyed `['cluster', …]`) again as soon as each is used. The blob is written
 * at most every `PERSIST_THROTTLE_MS`, while `staleTime` trusts an entry for a
 * minute: a load shortly after a list changed would otherwise restore the list
 * as it was before the change and show it without a read -- "No agents yet"
 * for an agent that is Ready.
 *
 * A restored list with rows still shows at once, marked stale, and the read
 * replaces it. A restored empty list is reset to loading instead: shown, it is
 * the one claim the read most often overturns ("nothing here").
 */
export async function markRestoredListsStale(
  client: QueryClient,
): Promise<void> {
  const isList = (queryKey: QueryKey) => queryKey[0] === 'cluster';
  const isEmpty = (data: unknown) => Array.isArray(data) && data.length === 0;
  await Promise.all([
    client.resetQueries({
      predicate: query => isList(query.queryKey) && isEmpty(query.state.data),
    }),
    client.invalidateQueries({
      predicate: query => isList(query.queryKey) && !isEmpty(query.state.data),
    }),
  ]);
}

// Once per page load: every mount of the provider restores, but only the
// first restore comes from a blob older than this page's own reads.
let restoredListsMarkedStale = false;
function onRestored() {
  if (restoredListsMarkedStale) {
    return;
  }
  restoredListsMarkedStale = true;
  markRestoredListsStale(queryClient);
}

export const QueryClientProvider = ({ children }: { children: ReactNode }) => {
  const persister = useMemo(
    () =>
      createPluginQueryPersister({
        key: AGENT_PLATFORM_PERSISTER_KEY,
        throttleTime: PERSIST_THROTTLE_MS,
      }),
    [],
  );

  return (
    <PersistQueryClientProvider
      client={queryClient}
      onSuccess={onRestored}
      persistOptions={{
        persister,
        maxAge,
        buster: AGENT_PLATFORM_CACHE_BUSTER,
        // Two independent reasons to keep a query out of localStorage, both
        // applied. `shouldPersistQuery` carries the shared rules — the library's
        // "only persist successful queries" default plus the `meta`-based opt-out
        // that permission probes use; `shouldDehydrateAgentPlatformQuery` adds
        // this plugin's user-scoped key allowlist (see isUserScopedQueryKey).
        dehydrateOptions: {
          shouldDehydrateQuery: query =>
            shouldPersistQuery(query) &&
            shouldDehydrateAgentPlatformQuery(query.queryKey),
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
};
