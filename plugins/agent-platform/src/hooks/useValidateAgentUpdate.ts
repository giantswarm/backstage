import { useQuery } from '@tanstack/react-query';

import type { AgentUpdate } from '../lib/agentManager';
import { musterValidateAgentUpdateQueryKey } from '../lib/queryKeys';
import { useAgentManagerClient } from './useAgentManager';
import { classifyReadFailure } from './useAgentManagerAgent';
import type { ValidateAgentState } from './useValidateAgent';

/**
 * `validate_agent` with `update: true`: the dry run of an update — the values
 * and manifests agent-manager would write, every violation, and with
 * `refreshSkills` every git skill re-pinned to its default-branch head. Nothing
 * is written. Re-read whenever the update changes; never persisted.
 *
 * `undefined` disables the read: the edit form passes it while nothing has
 * changed yet, the Update skills dialog while it is closed.
 */
export function useValidateAgentUpdate(
  installation: string | undefined,
  update: AgentUpdate | undefined,
): ValidateAgentState {
  const client = useAgentManagerClient(installation);
  const signature = update ? JSON.stringify(update) : '';
  const enabled = Boolean(client) && Boolean(update);

  const { data, isLoading, error } = useQuery({
    queryKey: musterValidateAgentUpdateQueryKey(installation ?? '', signature),
    enabled,
    queryFn: () => client!.validateUpdate(update!),
    // A refused dry run stays refused; retrying only delays the message.
    retry: false,
  });

  return {
    result: data,
    isLoading: enabled && isLoading,
    failure: error ? classifyReadFailure(error) : undefined,
  };
}
