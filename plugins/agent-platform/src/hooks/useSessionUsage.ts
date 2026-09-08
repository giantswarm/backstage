import { useApi } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { SessionUsageResponse } from '@giantswarm/backstage-plugin-agent-platform-common';
import { kagentApiRef } from '../apis';
import { sessionUsageQueryKey } from '../lib/queryKeys';

export type SessionUsageView = {
  usage: SessionUsageResponse | undefined;
  /** First load only, so a failed refetch keeps the last good summary. */
  isLoading: boolean;
  /** The read failed and nothing was read earlier. */
  isError: boolean;
  /**
   * kagent is not deployed or not readable here.
   *
   * Separated from `isError` because it is not a failure: the backend funnels
   * every "no kagent API here" outcome into a 404, and on a fleet where kagent
   * runs on two installations that is the ordinary answer for the rest.
   */
  isNotDeployed: boolean;
  error?: Error;
  refetch: () => void;
};

/**
 * The caller's usage summary for one installation.
 *
 * **Deliberately not polled**, unlike `useSessionStates` right beside it. That
 * one polls on the fast tier because it is what tells the page whether anything
 * is moving; this reports on a 30-day window whose buckets are days, and it is
 * the most expensive read in the plugin — the backend fans out over every one
 * of a user's sessions to answer it. The default `staleTime` (60s) plus the
 * backend's five-minute cache is the whole freshness story, and `evaluatedAt`
 * travels in the response so the page can show when it was computed rather than
 * implying it is live.
 */
export function useSessionUsage(
  installation: string | undefined,
  options: { enabled?: boolean } = {},
): SessionUsageView {
  const kagentApi = useApi(kagentApiRef);
  const enabled = Boolean(installation) && options.enabled !== false;

  const query = useQuery({
    queryKey: sessionUsageQueryKey(installation ?? ''),
    queryFn: () => kagentApi.getSessionUsage(installation!),
    enabled,
  });

  const errorName = (query.error as Error | null)?.name;
  const isNotDeployed =
    errorName === 'NotFoundError' || errorName === 'ServiceUnavailableError';

  return {
    usage: query.data,
    isLoading: enabled && query.isLoading,
    isError: query.isError && query.data === undefined && !isNotDeployed,
    isNotDeployed: query.isError && isNotDeployed,
    error: (query.error as Error | null) ?? undefined,
    refetch: query.refetch,
  };
}
