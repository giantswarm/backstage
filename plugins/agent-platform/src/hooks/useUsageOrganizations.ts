import { useMemo } from 'react';
import { useMimirQuery } from '@giantswarm/backstage-plugin-gs';
import { useAgents } from '../components/AgentsDataProvider';
import { UNKNOWN_AGENT_LABEL } from '../lib/llmUsage';
import { organizationsSeenQueryFor } from '../lib/llmUsageQueries';
import { tenantKindOf, tenantOf } from '../lib/tenants';

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

function compareNamespaces(a: string, b: string): number {
  return (
    KIND_ORDER[tenantKindOf(a)] - KIND_ORDER[tenantKindOf(b)] ||
    tenantOf(a).localeCompare(tenantOf(b))
  );
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
  days: number,
): UsageOrganizationsView {
  const seen = useMimirQuery({
    installationName: installation ?? '',
    query: organizationsSeenQueryFor(days),
    enabled: Boolean(installation),
  });
  const { rows: agents, isLoading: isLoadingAgents } = useAgents();

  const seenResult = seen.data?.data?.result;
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
    return [...set].sort(compareNamespaces);
  }, [seenResult, agents, installation]);

  return {
    namespaces,
    isLoading: Boolean(installation) && (seen.isLoading || isLoadingAgents),
  };
}
