import { useQuery } from '@tanstack/react-query';
import { isAwaitingData } from '@giantswarm/backstage-plugin-ui-react';

import {
  EGRESS_POLICIES_CAPABILITY,
  type AgentManagerEgressPolicy,
} from '../lib/agentManager';
import { musterAgentManagerEgressPoliciesQueryKey } from '../lib/queryKeys';
import { useAgentManagerClient, useAgentManagerInfo } from './useAgentManager';
import {
  classifyReadFailure,
  type AgentManagerReadFailure,
} from './useAgentManagerAgent';

export type AgentManagerEgressPoliciesState = {
  /** Whether agent-manager takes `egressPolicyRefs` (`get_info`). */
  supported: boolean;
  egressPolicies: AgentManagerEgressPolicy[];
  isLoading: boolean;
  failure?: AgentManagerReadFailure;
};

/**
 * `list_egress_policies`: the EgressPolicies of a namespace an agent there may
 * pick, read as the person. Asked only where agent-manager announces the
 * `egressPolicies` capability; elsewhere `supported` is false and nothing is
 * read.
 */
export function useAgentManagerEgressPolicies(
  installation: string | undefined,
  namespace: string | undefined,
): AgentManagerEgressPoliciesState {
  const client = useAgentManagerClient(installation);
  const { info } = useAgentManagerInfo(installation);
  const supported = Boolean(info?.capabilities?.[EGRESS_POLICIES_CAPABILITY]);
  const enabled = Boolean(client) && Boolean(namespace) && supported;

  const { data, error, isPending, fetchStatus } = useQuery({
    queryKey: musterAgentManagerEgressPoliciesQueryKey(
      installation ?? '',
      namespace ?? '',
    ),
    enabled,
    queryFn: () => client!.listEgressPolicies(namespace!),
    retry: false,
    staleTime: 60_000,
  });
  const isLoading = isAwaitingData({ isPending, fetchStatus });

  return {
    supported,
    egressPolicies: data ?? [],
    isLoading: enabled && isLoading,
    failure: error ? classifyReadFailure(error) : undefined,
  };
}
