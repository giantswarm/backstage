import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

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
  const { data, isLoading, error } = useQuery({
    queryKey: musterAgentManagerInfoQueryKey(installation ?? ''),
    enabled: Boolean(client),
    queryFn: () => client!.getInfo(),
    staleTime: 60_000,
    retry: false,
  });
  return {
    info: data,
    isLoading: Boolean(client) && isLoading,
    error: (error as Error) ?? null,
  };
}

export type AgentManagerPresence = MusterServerPresence;
export type AgentManagerAvailability = MusterServerAvailability;

/**
 * The installations on which agents can be created: the ones whose muster
 * registers agent-manager as an MCPServer (see `useMusterServerAvailability`).
 */
export function useAgentManagerAvailability(
  installations: string[],
): AgentManagerAvailability {
  return useMusterServerAvailability(AGENT_MANAGER_SERVER, installations);
}
