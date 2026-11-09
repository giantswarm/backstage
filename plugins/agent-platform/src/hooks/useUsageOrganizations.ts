import { useEffect, useMemo, useRef } from 'react';
import { useMimirQuery } from '@giantswarm/backstage-plugin-gs';
import { useAgents } from '../components/AgentsDataProvider';
import { UNKNOWN_AGENT_LABEL } from '../lib/llmUsage';
import { organizationsSeenQueryFor } from '../lib/llmUsageQueries';
import type { OrganizationDirectory } from '../lib/organizations';
import { tenantKindOf, tenantOf } from '../lib/tenants';
import { useOrganizationDirectory } from '../components/OrganizationDirectoryProvider';
import type { UsageWindow } from '../lib/usageWindow';

export type UsageOrganizationsView = {
  /**
   * The namespaces the Organization scope offers, the platform tenant first,
   * then the organizations by name, then any other namespace. Empty while
   * nothing is known.
   */
  namespaces: string[];
  isLoading: boolean;
};

/** Platform first, then organizations, then other namespaces; by name within. */
const KIND_ORDER = { platform: 0, organization: 1, namespace: 2 } as const;

/**
 * `namespaces` in that order, by the name the Organization select shows. Each
 * namespace's kind and name are worked out once, not per comparison.
 */
function sortNamespaces(
  namespaces: Iterable<string>,
  directory: OrganizationDirectory,
): string[] {
  return [...namespaces]
    .map(namespace => ({
      namespace,
      order: KIND_ORDER[tenantKindOf(namespace, directory)],
      label: tenantOf(namespace, directory),
    }))
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
    .map(({ namespace }) => namespace);
}

/**
 * The organizations the Usage screen's Organization scope can narrow to, on
 * one installation: every namespace the gateway attributed calls to in the
 * window (one small query, never itself narrowed, so a removed organization
 * whose spend is still in the window stays an option) plus every namespace
 * the roster's agents run in (so an organization with agents and no calls yet
 * is one too). Unattributed traffic is no scope: it has no namespace.
 *
 * The roster is the Agents provider's, already loaded for the by-agent
 * tables, so the second half costs nothing.
 */
export function useUsageOrganizations(
  installation: string | undefined,
  window: UsageWindow,
): UsageOrganizationsView {
  const seen = useMimirQuery({
    installationName: installation ?? '',
    query: organizationsSeenQueryFor(
      window.kind === 'month' ? { month: window.month } : { days: window.days },
    ),
    enabled: Boolean(installation),
    // In a month still being written the query re-keys with the clock every
    // five minutes (`usageWindowSpec`): hold the options across that, so the
    // control neither empties nor vanishes for a round trip.
    keepPreviousAnswer: true,
  });
  const { rows: agents, isLoading: isLoadingAgents } = useAgents();
  const { directory } = useOrganizationDirectory();

  // The hold is for the clock alone. A list held across a change of
  // installation or window is another scope's, and an organization picked
  // from it may not exist here; it counts as no answer, as before the hold.
  const scope = `${installation ?? ''}\n${window.kind === 'month' ? window.month : `${window.days}d`}`;
  const answeredScope = useRef(scope);
  useEffect(() => {
    if (!seen.isPlaceholderData && seen.data !== undefined) {
      answeredScope.current = scope;
    }
  }, [seen.isPlaceholderData, seen.data, scope]);
  const heldFromAnotherScope =
    seen.isPlaceholderData && answeredScope.current !== scope;

  const seenResult = heldFromAnotherScope ? undefined : seen.data?.data?.result;
  const namespaces = useMemo(() => {
    const set = new Set<string>();
    for (const sample of seenResult ?? []) {
      const namespace = sample.metric?.agent_namespace ?? '';
      if (namespace !== '' && namespace !== UNKNOWN_AGENT_LABEL) {
        set.add(namespace);
      }
    }
    // The roster is every installation's; only this installation's agents
    // run in this page's organizations, and without one there is none.
    if (installation !== undefined) {
      for (const agent of agents) {
        if (agent.installation === installation) {
          set.add(agent.namespace);
        }
      }
    }
    return sortNamespaces(set, directory);
  }, [seenResult, agents, installation, directory]);

  return {
    namespaces,
    isLoading:
      Boolean(installation) &&
      (seen.isLoading || heldFromAnotherScope || isLoadingAgents),
  };
}
