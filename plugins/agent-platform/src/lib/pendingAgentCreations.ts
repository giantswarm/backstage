import type { Query, QueryClient } from '@tanstack/react-query';

/**
 * How long after a deploy the Agents list keeps watching for the new agent.
 * Flux renders the `Agent` from the release within seconds to a minute; past
 * this window a missing agent is a failed release, which the detail page
 * reports, and polling the list faster cannot help.
 */
export const PENDING_CREATION_WINDOW_MS = 3 * 60_000;

type PendingCreation = { namespace: string; name: string; deployedAt: number };

/**
 * The agents deployed from this portal that the roster has not listed yet, per
 * installation. Held beside the query client rather than in its cache: the
 * cache is persisted to localStorage, and this is one page's short-lived
 * expectation, not installation state.
 */
const pendingByClient = new WeakMap<
  QueryClient,
  Map<string, PendingCreation[]>
>();

function pendingOn(queryClient: QueryClient): Map<string, PendingCreation[]> {
  let pending = pendingByClient.get(queryClient);
  if (!pending) {
    pending = new Map();
    pendingByClient.set(queryClient, pending);
  }
  return pending;
}

/**
 * Records a successful deploy: until the installation's Agents list shows the
 * agent (or the window passes), the list is polled on the transitional tier
 * instead of the baseline, so the roster picks the agent up within seconds of
 * its `Agent` existing. Invalidating alone is not enough: the refetch it
 * triggers usually lands before Flux has rendered the `Agent`, and that list,
 * fresh for a minute, would otherwise wait for the baseline poll.
 */
export function markAgentDeployed(
  queryClient: QueryClient,
  installation: string,
  agent: { namespace: string; name: string },
  now: number = Date.now(),
): void {
  const pending = pendingOn(queryClient);
  const others = (pending.get(installation) ?? []).filter(
    entry => entry.namespace !== agent.namespace || entry.name !== agent.name,
  );
  pending.set(installation, [...others, { ...agent, deployedAt: now }]);
}

type ListedObject = { metadata?: { namespace?: string; name?: string } };

/**
 * Whether an installation's Agents list query still awaits an agent deployed
 * from this portal: one marked by {@link markAgentDeployed}, inside the window
 * and not yet among the list's items. Settled and expired entries are dropped
 * on the way. The installation is the list query's second key segment
 * (`['cluster', <installation>, 'list', …]`).
 */
export function awaitsDeployedAgent(
  queryClient: QueryClient,
  query: Query<any, any, any, any>,
  now: number = Date.now(),
): boolean {
  const installation = query.queryKey[1];
  const pending = pendingOn(queryClient);
  if (typeof installation !== 'string' || !pending.has(installation)) {
    return false;
  }
  const items = (query.state.data ?? []) as ListedObject[];
  const awaited = pending
    .get(installation)!
    .filter(
      entry =>
        now - entry.deployedAt < PENDING_CREATION_WINDOW_MS &&
        !items.some(
          item =>
            item.metadata?.namespace === entry.namespace &&
            item.metadata?.name === entry.name,
        ),
    );
  if (awaited.length === 0) {
    pending.delete(installation);
    return false;
  }
  pending.set(installation, awaited);
  return true;
}
