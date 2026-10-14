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
  failure?: AgentManagerReadFailure;
};

/**
 * One agent-manager dry run as the signed-in person: nothing is written, and
 * the `['muster', …]` key keeps it out of the persisted cache. `queryKey` must
 * carry everything `run` depends on; `run` absent disables the read.
 */
export function useAgentManagerDryRun<T>(
  installation: string | undefined,
  queryKey: QueryKey,
  run: ((client: AgentManagerClient) => Promise<T>) | undefined,
): AgentManagerDryRunState<T> {
  const client = useAgentManagerClient(installation);
  const enabled = Boolean(client) && Boolean(run);

  const { data, error, isPending, fetchStatus } = useQuery({
    queryKey,
    enabled,
    queryFn: () => run!(client!),
    // A refused dry run stays refused; retrying only delays the message.
    retry: false,
  });
  const isLoading = isAwaitingData({ isPending, fetchStatus });

  return {
    result: data,
    isLoading: enabled && isLoading,
    failure: error ? classifyReadFailure(error) : undefined,
  };
}
