import { useQuery } from '@tanstack/react-query';
import { isAwaitingData } from '@giantswarm/backstage-plugin-ui-react';

import type { AgentUpdate, CommitAgentResult } from '../lib/agentManager';
import { musterCommitAgentUpdateDryRunQueryKey } from '../lib/queryKeys';
import { useAgentManagerClient } from './useAgentManager';
import {
  classifyReadFailure,
  type AgentManagerReadFailure,
} from './useAgentManagerAgent';

export type CommitAgentUpdateDryRunState = {
  result: CommitAgentResult | undefined;
  isLoading: boolean;
  failure?: AgentManagerReadFailure;
};

/**
 * `update_agent` with `mode: commit` and `dryRun`: the pull request an update
 * of an agent applied from git would open — its repository, directory and
 * files — without opening it. Unlike `validate_agent`, agent-manager reads the
 * repository as the person here, so it refuses up front what the real commit
 * would, such as a release defined outside its directory. Nothing is written.
 *
 * `undefined` disables the read, as for `useValidateAgentUpdate`: the Update
 * skills dialog passes it while closed, and for an agent written live.
 */
export function useCommitAgentUpdateDryRun(
  installation: string | undefined,
  update: AgentUpdate | undefined,
): CommitAgentUpdateDryRunState {
  const client = useAgentManagerClient(installation);
  const signature = update ? JSON.stringify(update) : '';
  const enabled = Boolean(client) && Boolean(update);

  const { data, error, isPending, fetchStatus } = useQuery({
    queryKey: musterCommitAgentUpdateDryRunQueryKey(
      installation ?? '',
      signature,
    ),
    enabled,
    queryFn: () => client!.commitUpdateAgent(update!, { dryRun: true }),
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
