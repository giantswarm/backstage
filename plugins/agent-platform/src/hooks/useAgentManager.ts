import { useContext, useMemo, useState } from 'react';
import {
  QueryClientContext,
  queryOptions,
  useQueries,
  useQuery,
} from '@tanstack/react-query';
import { isAwaitingData } from '@giantswarm/backstage-plugin-ui-react';

import { AgentManagerClient } from '../apis/AgentManagerClient';
import {
  AGENT_MANAGER_SERVER,
  type AgentManagerInfo,
} from '../lib/agentManager';
import {
  ORGANIZATIONS_CAPABILITY,
  organizationTenantChoices,
  type OrganizationReads,
} from '../lib/organizations';
import { musterAgentManagerInfoQueryKey } from '../lib/queryKeys';
import {
  ORGANIZATIONS_STALE_TIME,
  organizationsQuery,
} from './organizationsQuery';
import { useMusterPluginApi } from './useMusterPluginApi';
import {
  useMusterServerAvailability,
  type MusterServerAvailability,
  type MusterServerPresence,
} from '@giantswarm/backstage-plugin-muster';

/**
 * agent-manager's tools on one installation, as the signed-in person —
 * `undefined` without the muster plugin (the only way to reach agent-manager)
 * or without an installation.
 */
export function useAgentManagerClient(
  installation: string | undefined,
): AgentManagerClient | undefined {
  const clientOf = useAgentManagerClients();
  return useMemo(
    () => (clientOf && installation ? clientOf(installation) : undefined),
    [clientOf, installation],
  );
}

/**
 * Makes agent-manager clients for any installation, as
 * {@link useAgentManagerClient} makes one: each tells an organization's
 * namespace by the cached `get_info` and `list_organizations`, the entries
 * the organization pages and the directory share. `undefined` without the
 * muster plugin.
 */
export function useAgentManagerClients():
  ((installation: string) => AgentManagerClient) | undefined {
  const musterApi = useMusterPluginApi();
  // Outside a QueryClientProvider (a page header's actions) the client
  // reads the organizations itself, uncached.
  const queryClient = useContext(QueryClientContext);
  return useMemo(() => {
    if (!musterApi) {
      return undefined;
    }
    return (installation: string) => {
      const reads: OrganizationReads | undefined = queryClient
        ? {
            info: () =>
              queryClient.fetchQuery(
                agentManagerInfoQuery(musterApi, installation),
              ),
            listing: () =>
              queryClient.fetchQuery(
                organizationsQuery(musterApi, installation),
              ),
          }
        : undefined;
      return new AgentManagerClient(musterApi, installation, reads);
    };
  }, [musterApi, queryClient]);
}

/**
 * `get_info` of one installation as a query: every reader shares one cache
 * entry, so they share its options too. Installation configuration read
 * through the person's session: a minute of staleness is fine.
 */
export function agentManagerInfoQuery(
  musterApi: ReturnType<typeof useMusterPluginApi>,
  installation: string,
) {
  return queryOptions({
    queryKey: musterAgentManagerInfoQueryKey(installation),
    queryFn: () => new AgentManagerClient(musterApi!, installation).getInfo(),
    staleTime: 60_000,
    retry: false,
  });
}

export type AgentManagerInfoState = {
  info: AgentManagerInfo | undefined;
  isLoading: boolean;
  error: Error | null;
  /**
   * Whether `get_info` can be read at all: the muster plugin is installed and
   * an installation given.
   */
  canRead: boolean;
  /** Reads `get_info` again (Check again); react-query's own, stable. */
  refetch: () => Promise<unknown>;
};

/**
 * `get_info`: the chart agent-manager tracks, the platform Harness, the muster
 * URL it composes and its capability flags. Installation configuration read
 * through the person's session, so a minute of staleness is fine and it is
 * never persisted.
 */
export function useAgentManagerInfo(
  installation: string | undefined,
): AgentManagerInfoState {
  const musterApi = useMusterPluginApi();
  const client = useAgentManagerClient(installation);
  const { data, error, isPending, fetchStatus, refetch } = useQuery({
    ...agentManagerInfoQuery(musterApi, installation ?? ''),
    enabled: Boolean(client),
  });
  const isLoading = isAwaitingData({ isPending, fetchStatus });
  return {
    info: data,
    isLoading: Boolean(client) && isLoading,
    error: (error as Error) ?? null,
    canRead: Boolean(client),
    refetch,
  };
}

export type AgentManagerPresence = MusterServerPresence;
export type AgentManagerAvailability = MusterServerAvailability;

/**
 * The installations on which agents can be created, changed and talked to:
 * the ones whose muster registers agent-manager as an MCPServer (see
 * `useMusterServerAvailability`) and reaches it as the person. An
 * installation whose muster has no per-user sign-in is `sharedIdentity`:
 * muster-backend refuses agent-manager's tools there.
 */
export function useAgentManagerAvailability(
  installations: string[],
): AgentManagerAvailability {
  return useMusterServerAvailability(AGENT_MANAGER_SERVER, installations);
}

/**
 * Whether the person may create an agent on none of `installations`. Where
 * agent-manager serves organizations (`get_info`'s `organizations`
 * capability), the answer is the organizations the person belongs to
 * (`list_organizations`), taken as the New agent form takes it
 * (`organizationTenantChoices`): none they may create agents in is nowhere
 * there. An answer read before the hook first rendered is read again, and
 * waited for, so an organization the person was just added to counts.
 * Elsewhere it is `get_info`'s `namespaces.managed` (agent-manager checks
 * each with a `SelfSubjectAccessReview`): an empty list is nowhere. An
 * installation whose agent-manager is not reached as the person, whose
 * `get_info` or `list_organizations` failed, or whose answer names no
 * `managed` list says nothing either way and counts as one the person may
 * create on.
 */
export function useCreatesAgentsNowhere(installations: string[]): {
  createsNowhere: boolean;
  isLoading: boolean;
} {
  const musterApi = useMusterPluginApi();
  const availability = useAgentManagerAvailability(installations);
  // Same query as `useAgentManagerInfo`, asked only where muster reaches
  // agent-manager as the person.
  const infos = useQueries({
    queries: installations.map(installation => ({
      ...agentManagerInfoQuery(musterApi, installation),
      enabled:
        Boolean(musterApi) &&
        availability.presenceOf(installation) === 'available',
    })),
  });
  const isAvailable = (index: number) =>
    availability.presenceOf(installations[index]) === 'available';
  const servesOrganizations = (index: number) =>
    infos[index].data?.capabilities?.[ORGANIZATIONS_CAPABILITY] === true;
  // The directory's entries, read again here when their answer predates
  // the first render: stale for this reader only, so it reads on mount (or
  // once `get_info` enables it), and the directory keeps its minute.
  const [shownAt] = useState(() => Date.now());
  const listings = useQueries({
    queries: installations.map((installation, index) => ({
      ...organizationsQuery(musterApi, installation),
      enabled:
        Boolean(musterApi) && isAvailable(index) && servesOrganizations(index),
      staleTime: ({ state }: { state: { dataUpdatedAt: number } }) =>
        state.dataUpdatedAt < shownAt ? 0 : ORGANIZATIONS_STALE_TIME,
    })),
  });
  const isLoading = installations.some((installation, index) => {
    if (!isAvailable(index)) {
      return (
        availability.presenceOf(installation) === 'unknown' &&
        availability.isLoading
      );
    }
    if (isAwaitingData(infos[index])) {
      return true;
    }
    const listing = listings[index];
    // An answer from before the first render decides nothing while it is
    // read again: a person just added would see "may not create" first.
    return (
      servesOrganizations(index) &&
      (isAwaitingData(listing) ||
        (listing.isFetching && listing.dataUpdatedAt < shownAt))
    );
  });
  const createsNowhereOn = (index: number) => {
    if (!isAvailable(index)) {
      return false;
    }
    if (servesOrganizations(index)) {
      const { data, isError } = listings[index];
      return (
        !isError &&
        data !== undefined &&
        organizationTenantChoices(data).choices.length === 0
      );
    }
    return infos[index].data?.namespaces?.managed?.length === 0;
  };
  return {
    createsNowhere:
      !isLoading &&
      installations.length > 0 &&
      installations.every((_, index) => createsNowhereOn(index)),
    isLoading,
  };
}

/**
 * The ids (`<installation>/<namespace>/<name>`) of the default agents of
 * `installations` (home first), as each one's agent-manager answers
 * `get_info` (`defaultAgent`): agent-manager decides which agent that is, the
 * portal does not resolve it again. Asked only where muster reaches
 * agent-manager as the person, and of the other installations only when the
 * home one names none — or, with `everywhere`, of every installation, for a
 * report on all of them rather than one agent to preselect. An installation
 * whose answer has none, or that has not answered, contributes nothing.
 */
export function useDefaultAgentIds(
  installations: string[],
  { everywhere = false }: { everywhere?: boolean } = {},
): Set<string> {
  const musterApi = useMusterPluginApi();
  const availability = useAgentManagerAvailability(installations);
  const reachable = (installation: string) =>
    Boolean(musterApi) && availability.presenceOf(installation) === 'available';
  const [home = '', ...others] = installations;
  const homeInfo = useQuery({
    ...agentManagerInfoQuery(musterApi, home),
    enabled: Boolean(home) && reachable(home),
  });
  const homeDefault = homeInfo.data?.defaultAgent?.trim() ?? '';
  // The others once the home installation has answered without one, or is
  // known not to be reached.
  const homeSettled = reachable(home)
    ? !isAwaitingData(homeInfo)
    : !availability.isLoading;
  const askOthers = everywhere || (!homeDefault && homeSettled);
  const otherDefaults = useQueries({
    queries: others.map(installation => ({
      ...agentManagerInfoQuery(musterApi, installation),
      enabled: askOthers && reachable(installation),
    })),
    combine: results =>
      results.map(result => result.data?.defaultAgent?.trim() ?? ''),
  });
  const ids = [homeDefault, ...otherDefaults]
    .map((ref, index) => (ref ? `${installations[index]}/${ref}` : ''))
    .filter(Boolean)
    .join(',');
  return useMemo(() => new Set(ids ? ids.split(',') : []), [ids]);
}
