import { useQuery } from '@tanstack/react-query';

import {
  AgentManagerError,
  isSettledVerdict,
  type AgentStatus,
} from '../lib/agentManager';
import { musterAgentStatusQueryKey } from '../lib/queryKeys';
import { useAgentManagerClient } from './useAgentManager';

/**
 * How often `get_agent_status` is re-read while the template is still
 * compiling. A fresh release renders its template within seconds and the
 * platform Harness reports Ready shortly after; this is the pace a person
 * watching the page notices without hammering agent-manager.
 */
export const AGENT_STATUS_POLL_INTERVAL_MS = 3_000;

export type AgentStatusState = {
  status: AgentStatus | undefined;
  /** True until the verdict is `ready` or `failed`. */
  isSettling: boolean;
  /**
   * agent-manager answered `not_found`: by its contract, neither an
   * AgentTemplate nor a HelmRelease of that name exists. Right after a create
   * this is transient and polled through (see {@link isSettling}); on a page
   * reached any other way it is the difference between "not yet" and "not
   * there".
   */
  isNotFound: boolean;
  error: Error | null;
};

/**
 * `get_agent_status` for one agent, polled until the platform Harness has a
 * verdict: `ready`, or `failed` with the reason. On API v2 that verdict comes
 * from the template's `status.harnesses[]` entry for the platform Harness —
 * the same rules the detail page's own readiness reads, so the two agree. A
 * `not_found` right after the create is the release not having rendered the
 * template yet, and is polled through like `progressing`.
 */
export function useAgentStatus(
  installation: string | undefined,
  namespace: string,
  name: string,
  options: { enabled?: boolean } = {},
): AgentStatusState {
  const client = useAgentManagerClient(installation);
  const enabled = (options.enabled ?? true) && Boolean(client) && Boolean(name);

  const { data, error } = useQuery({
    queryKey: musterAgentStatusQueryKey(installation ?? '', namespace, name),
    enabled,
    queryFn: () => client!.getAgentStatus(namespace, name),
    refetchInterval: query => {
      const verdict = query.state.data?.verdict;
      if (verdict && isSettledVerdict(verdict)) {
        return false;
      }
      const lastError = query.state.error;
      if (
        lastError &&
        !(
          lastError instanceof AgentManagerError &&
          lastError.code === 'not_found'
        )
      ) {
        return false;
      }
      return AGENT_STATUS_POLL_INTERVAL_MS;
    },
    // The interval above is the retry: an error other than not_found stops
    // it and is shown; a not_found keeps polling.
    retry: false,
  });

  const notFoundYet =
    error instanceof AgentManagerError && error.code === 'not_found';

  return {
    status: data,
    isNotFound: notFoundYet,
    isSettling:
      enabled &&
      (notFoundYet || !data || !isSettledVerdict(data.verdict)) &&
      (!error || notFoundYet),
    error: error && !notFoundYet ? (error as Error) : null,
  };
}
