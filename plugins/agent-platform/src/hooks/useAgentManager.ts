import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
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
} from './useMusterServerAvailability';

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
  const client = useAgentManagerClient(installation);
  const { data, error, isPending, fetchStatus, refetch } = useQuery({
    queryKey: musterAgentManagerInfoQueryKey(installation ?? ''),
    enabled: Boolean(client),
    queryFn: () => client!.getInfo(),
    staleTime: 60_000,
    retry: false,
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
      queryKey: musterAgentManagerInfoQueryKey(installation),
      enabled:
        Boolean(musterApi) &&
        availability.presenceOf(installation) === 'available',
      queryFn: () => new AgentManagerClient(musterApi!, installation).getInfo(),
      staleTime: 60_000,
      retry: false,
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
