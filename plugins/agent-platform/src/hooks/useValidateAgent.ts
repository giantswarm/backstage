import { useQuery } from '@tanstack/react-query';

import {
  AgentManagerError,
  AgentManagerNotConnectedError,
  type AgentSpec,
  type ValidateAgentResult,
} from '../lib/agentManager';
import { musterValidateAgentQueryKey } from '../lib/queryKeys';
import { useAgentManagerClient } from './useAgentManager';

export type ValidateAgentState = {
  /** The dry run, once agent-manager answered. */
  result: ValidateAgentResult | undefined;
  isLoading: boolean;
  /**
   * `refused`: agent-manager answered the call itself with a refusal (an
   * unknown ModelConfig, a malformed request) rather than a dry run with
   * `errors[]`. `not-connected`: the person's muster session is not connected
   * to agent-manager yet. `error`: anything else (muster unreachable, the
   * portal session gone).
   */
  failure?: {
    kind: 'refused' | 'not-connected' | 'error';
    message: string;
  };
};

/**
 * `validate_agent`: the manifests a create of `spec` would apply and every
 * violation, rendered by agent-manager. Re-read whenever the spec changes;
 * never persisted (per person) and re-read once the person connects to
 * agent-manager in muster (the `['muster', …]` invalidation).
 */
export function useValidateAgent(
  installation: string | undefined,
  spec: AgentSpec | undefined,
): ValidateAgentState {
  const client = useAgentManagerClient(installation);
  const signature = spec ? JSON.stringify(spec) : '';
  const enabled = Boolean(client) && Boolean(spec);

  const { data, isLoading, error } = useQuery({
    queryKey: musterValidateAgentQueryKey(installation ?? '', signature),
    enabled,
    queryFn: () => client!.validateAgent(spec!),
    // A refused validation stays refused; retrying only delays the message.
    retry: false,
  });

  let failure: ValidateAgentState['failure'];
  if (error) {
    const message = (error as Error).message;
    if (error instanceof AgentManagerNotConnectedError) {
      failure = { kind: 'not-connected', message };
    } else if (error instanceof AgentManagerError) {
      failure = { kind: 'refused', message };
    } else {
      failure = { kind: 'error', message };
    }
  }

  return {
    result: data,
    isLoading: enabled && isLoading,
    failure,
  };
}
