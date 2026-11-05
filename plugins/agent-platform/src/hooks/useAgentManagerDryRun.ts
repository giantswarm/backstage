import { useQuery, type QueryKey } from '@tanstack/react-query';
import { isAwaitingData } from '@giantswarm/backstage-plugin-ui-react';

import type { AgentManagerClient } from '../apis/AgentManagerClient';
import { useAgentManagerClient } from './useAgentManager';
import {
  classifyReadFailure,
  type AgentManagerReadFailure,
} from './useAgentManagerAgent';

export type AgentManagerDryRunState<T> = {
  /** The dry run, once agent-manager answered. */
  result: T | undefined;
  isLoading: boolean;
  /** Asked again while an earlier answer is kept (a re-read, a refetch). */
  isFetching: boolean;
  failure?: AgentManagerReadFailure;
};

/**
 * One agent-manager dry run as the signed-in person: nothing is written, and
 * the `['muster', …]` key keeps it out of the persisted cache. `queryKey` must
 * carry everything `run` depends on; `run` absent disables the read.
 *
 * With `freshOnMount`, an answer cached before this reader mounted is not
 * trusted: it is asked again on mount and reported loading until that answer
 * lands. For a gate that must answer for now, not for an earlier visit.
 */
export function useAgentManagerDryRun<T>(
  installation: string | undefined,
  queryKey: QueryKey,
  run: ((client: AgentManagerClient) => Promise<T>) | undefined,
  options: { freshOnMount?: boolean } = {},
): AgentManagerDryRunState<T> {
  const client = useAgentManagerClient(installation);
  const enabled = Boolean(client) && Boolean(run);
  const freshOnMount = options.freshOnMount ?? false;

  const { data, error, isPending, fetchStatus, isFetchedAfterMount } = useQuery(
    {
      queryKey,
      enabled,
      queryFn: () => run!(client!),
      // A refused dry run stays refused; retrying only delays the message.
      retry: false,
      // Stale at once, so a reader enabled after it mounted asks again too.
      ...(freshOnMount
        ? { staleTime: 0, refetchOnMount: 'always' as const }
        : {}),
    },
  );
  const isLoading =
    isAwaitingData({ isPending, fetchStatus }) ||
    (freshOnMount && !isFetchedAfterMount);

  return {
    result: data,
    isLoading: enabled && isLoading,
    isFetching: enabled && fetchStatus === 'fetching',
    failure: error ? classifyReadFailure(error) : undefined,
  };
}
