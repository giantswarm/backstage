import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { isAwaitingData } from '@giantswarm/backstage-plugin-ui-react';

import {
  AgentManagerError,
  AgentManagerNotConnectedError,
  type AgentManagerAgent,
} from '../lib/agentManager';
import { musterAgentManagerAgentQueryKey } from '../lib/queryKeys';
import { useAgentManagerClient } from './useAgentManager';

/**
 * Why the agent could not be read through agent-manager: `refused` carries
 * agent-manager's own answer (a `not_found` for an agent that is gone, the
 * apiserver's Forbidden), `not-connected` means the person's muster session
 * has to be connected to agent-manager first, `error` is everything else.
 */
export type AgentManagerReadFailure = {
  kind: 'refused' | 'not-connected' | 'error';
  code?: AgentManagerError['code'];
  message: string;
};

export function classifyReadFailure(error: unknown): AgentManagerReadFailure {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof AgentManagerNotConnectedError) {
    return { kind: 'not-connected', message };
  }
  if (error instanceof AgentManagerError) {
    return { kind: 'refused', code: error.code, message };
  }
  return { kind: 'error', message };
}

export type AgentManagerAgentState = {
  agent: AgentManagerAgent | undefined;
  isLoading: boolean;
  failure?: AgentManagerReadFailure;
};

/**
 * `get_agent`: the agent as agent-manager reads it — the values the edit form
 * is pre-filled from, the skills with their pins, the declared toolset and how
 * the agent is managed. Read as the signed-in person; never persisted.
 *
 * With `freshOnMount`, a cached reading from before this reader mounted is not
 * handed out: the agent is read again and reported loading until that read
 * lands. For a form seeded once from the agent — the edit wizard — where a
 * stale baseline is wrong twice over: the form shows the old values, and a
 * save diffs against them (live round 2, R2: opening the wizard right after a
 * save prefilled the pre-save description). Once a fresh reading has been
 * handed out, a later failed re-read does not take it back.
 */
export function useAgentManagerAgent(
  installation: string | undefined,
  namespace: string,
  name: string,
  options: { enabled?: boolean; freshOnMount?: boolean } = {},
): AgentManagerAgentState {
  const client = useAgentManagerClient(installation);
  const freshOnMount = options.freshOnMount ?? false;
  const enabled =
    (options.enabled ?? true) &&
    Boolean(client) &&
    Boolean(namespace) &&
    Boolean(name);
  const queryKey = musterAgentManagerAgentQueryKey(
    installation ?? '',
    namespace,
    name,
  );

  const { data, error, isPending, fetchStatus, isFetchedAfterMount, status } =
    useQuery({
      queryKey,
      enabled,
      queryFn: () => client!.getAgent(namespace, name),
      // A refused read stays refused; the mutations invalidate this on success.
      retry: false,
      // A fresh reader treats whatever is cached as stale, so it is read again
      // on mount — or when the reader is enabled later, which a 15s staleTime
      // would skip. Not again on focus: the reading only matters at seed time.
      ...(freshOnMount
        ? { staleTime: 0, refetchOnWindowFocus: false }
        : { staleTime: 15_000 }),
    });
  const isLoading = isAwaitingData({ isPending, fetchStatus });

  // Latched per agent, so a background re-read that fails later does not
  // withdraw the reading a form was already seeded from.
  const freshFor = useRef<string | undefined>(undefined);
  const keyId = queryKey.join('/');
  if (freshOnMount && isFetchedAfterMount && status === 'success') {
    freshFor.current = keyId;
  }
  if (freshOnMount) {
    const isFresh = freshFor.current === keyId;
    return {
      agent: isFresh ? data : undefined,
      isLoading: enabled && !isFresh && (isLoading || !isFetchedAfterMount),
      failure:
        !isFresh && isFetchedAfterMount && error
          ? classifyReadFailure(error)
          : undefined,
    };
  }

  return {
    agent: data,
    isLoading: enabled && isLoading,
    failure: error ? classifyReadFailure(error) : undefined,
  };
}
