import type { Query } from '@tanstack/react-query';

/**
 * How long after a deploy the Agents list keeps watching for the new agent.
 * Flux renders the `Agent` from the release within seconds to a minute; past
 * this window a missing agent is a failed release, which the detail page
 * reports, and polling the list faster cannot help.
 */
export const PENDING_CREATION_WINDOW_MS = 3 * 60_000;

/**
 * Where the deploys still awaited live: the tab's `sessionStorage`, so the
 * expectation survives a reload of the page that deployed, never reaches
 * another tab or person, and goes with the tab. Not the query cache: that is
 * persisted to localStorage for an hour and shared by every tab.
 */
export const PENDING_CREATIONS_STORAGE_KEY =
  'agent-platform-pending-agent-creations';

type PendingCreation = {
  installation: string;
  namespace: string;
  name: string;
  deployedAt: number;
};

function read(): PendingCreation[] {
  try {
    const stored = window.sessionStorage.getItem(PENDING_CREATIONS_STORAGE_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(pending: PendingCreation[]): void {
  try {
    if (pending.length === 0) {
      window.sessionStorage.removeItem(PENDING_CREATIONS_STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(
        PENDING_CREATIONS_STORAGE_KEY,
        JSON.stringify(pending),
      );
    }
  } catch {
    // Storage blocked or full: the roster falls back to its own tiers.
  }
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
  installation: string,
  agent: { namespace: string; name: string },
  now: number = Date.now(),
): void {
  write([
    ...read().filter(
      entry =>
        entry.installation !== installation ||
        entry.namespace !== agent.namespace ||
        entry.name !== agent.name,
    ),
    {
      installation,
      namespace: agent.namespace,
      name: agent.name,
      deployedAt: now,
    },
  ]);
}

type ListedObject = { metadata?: { namespace?: string; name?: string } };

/**
 * Whether an installation's Agents list query still awaits an agent deployed
 * from this tab: one marked by {@link markAgentDeployed}, inside the window
 * and not yet among the list's items. Settled and expired entries are dropped
 * on the way. The installation is the list query's second key segment
 * (`['cluster', <installation>, 'list', …]`).
 */
export function awaitsDeployedAgent(
  query: Query<any, any, any, any>,
  now: number = Date.now(),
): boolean {
  const installation = query.queryKey[1];
  const pending = read();
  if (
    typeof installation !== 'string' ||
    !pending.some(entry => entry.installation === installation)
  ) {
    return false;
  }
  const items = (query.state.data ?? []) as ListedObject[];
  const settled = (entry: PendingCreation) =>
    entry.installation === installation &&
    (now - entry.deployedAt >= PENDING_CREATION_WINDOW_MS ||
      items.some(
        item =>
          item.metadata?.namespace === entry.namespace &&
          item.metadata?.name === entry.name,
      ));
  const remaining = pending.filter(entry => !settled(entry));
  if (remaining.length !== pending.length) {
    write(remaining);
  }
  return remaining.some(entry => entry.installation === installation);
}
