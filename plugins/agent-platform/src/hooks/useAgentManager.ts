import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';

import { AgentManagerClient } from '../apis/AgentManagerClient';
import { AGENT_MANAGER_SERVER, type AgentManagerInfo } from '../lib/agentManager';
import {
  musterAgentManagerInfoQueryKey,
  musterServersQueryKey,
} from '../lib/queryKeys';
import { useMusterPluginApi } from './useMusterPluginApi';

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

/**
 * Whether an installation's muster lists agent-manager (`core_mcpserver_list`)
 * — the one signal the create flow gates on. `unknown` while the read is in
 * flight or failed; `missing` when muster answered without it.
 */
export type AgentManagerPresence = 'available' | 'missing' | 'unknown';

export type AgentManagerAvailability = {
  /** The installations whose muster lists agent-manager. */
  available: string[];
  /** The installations whose muster answered without agent-manager. */
  missing: string[];
  presenceOf: (installation: string) => AgentManagerPresence;
  /** True while any installation's server list is still being read. */
  isLoading: boolean;
  /** The muster plugin is not installed: nothing can be created anywhere. */
  isUnavailable: boolean;
};

/**
 * The installations on which agents can be created: the ones whose muster
 * registers agent-manager as an MCPServer. Read per installation through the
 * person's own muster session (`musterApi.listServers`), which is also what
 * `validate_agent` and `create_agent` will go through — so an installation
 * offered here is one the person can actually reach agent-manager on.
 */
export function useAgentManagerAvailability(
  installations: string[],
): AgentManagerAvailability {
  const musterApi = useMusterPluginApi();
  const queries = useQueries({
    queries: installations.map(installation => ({
      queryKey: musterServersQueryKey(installation),
      enabled: Boolean(musterApi),
      queryFn: () => musterApi!.listServers(installation),
      staleTime: 60_000,
      retry: false,
    })),
  });

  // Keyed on contents: `useQueries` returns fresh arrays every render and
  // callers derive `installations` inline.
  const signature = installations
    .map((installation, index) => {
      const query = queries[index];
      const servers = query.data?.mcpServers;
      const presence = !servers
        ? 'unknown'
        : servers.some(server => server.name === AGENT_MANAGER_SERVER)
          ? 'available'
          : 'missing';
      return `${installation}:${presence}:${query.isLoading ? 'l' : ''}`;
    })
    .join('|');

  return useMemo(() => {
    const presence = new Map<string, AgentManagerPresence>();
    let isLoading = false;
    for (const entry of signature ? signature.split('|') : []) {
      const [installation, state, loading] = entry.split(':');
      presence.set(installation, state as AgentManagerPresence);
      isLoading = isLoading || loading === 'l';
    }
    const of = (installation: string): AgentManagerPresence =>
      presence.get(installation) ?? 'unknown';
    return {
      available: installations.filter(name => of(name) === 'available'),
      missing: installations.filter(name => of(name) === 'missing'),
      presenceOf: of,
      isLoading: Boolean(musterApi) && isLoading,
      isUnavailable: !musterApi,
    };
    // `installations` is captured by the signature.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, musterApi]);
}
