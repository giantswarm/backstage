import { useMemo } from 'react';
import { queryOptions, useQueries, useQuery } from '@tanstack/react-query';
import { isAwaitingData } from '@giantswarm/backstage-plugin-ui-react';

import { AgentManagerClient } from '../apis/AgentManagerClient';
import {
  AGENT_MANAGER_SERVER,
  type AgentManagerInfo,
} from '../lib/agentManager';
import { musterAgentManagerInfoQueryKey } from '../lib/queryKeys';
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
  const musterApi = useMusterPluginApi();
  return useMemo(
    () =>
      musterApi && installation
        ? new AgentManagerClient(musterApi, installation)
        : undefined,
    [musterApi, installation],
  );
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
 * Whether the person may create an agent on none of `installations`: on each,
 * agent-manager answered `get_info` as them with no namespace in
 * `namespaces.managed` (it checks each with a `SelfSubjectAccessReview`). An
 * installation whose agent-manager is not reached as the person, whose
 * `get_info` failed, or whose answer names no `managed` list says nothing
 * either way and counts as one the person may create on.
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
  const isLoading = installations.some((installation, index) =>
    isAvailable(index)
      ? isAwaitingData(infos[index])
      : availability.presenceOf(installation) === 'unknown' &&
        availability.isLoading,
  );
  return {
    createsNowhere:
      !isLoading &&
      installations.length > 0 &&
      installations.every(
        (_, index) =>
          isAvailable(index) &&
          infos[index].data?.namespaces?.managed?.length === 0,
      ),
    isLoading,
  };
}

/**
 * The ids (`<installation>/<namespace>/<name>`) of the default agents of
 * `installations` (home first), as each one's agent-manager answers
 * `get_info` (`defaultAgent`): agent-manager decides which agent that is, the
 * portal does not resolve it again. Asked only where muster reaches
 * agent-manager as the person, and of the other installations only when the
 * home one names none. An installation whose answer has none, or that has not
 * answered, contributes nothing.
 */
export function useDefaultAgentIds(installations: string[]): Set<string> {
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
  const askOthers = !homeDefault && homeSettled;
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
