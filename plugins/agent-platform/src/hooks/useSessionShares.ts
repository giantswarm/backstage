import { useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { kagentApiRef } from '../apis';

/**
 * One session's shares — what the share dialog lists and the share mutations
 * invalidate.
 *
 * `'session-shares'` is on `USER_SCOPED_RESOURCES` in
 * `components/QueryClientProvider`, so this is never persisted to
 * localStorage: who a session is shared with, and until when, is the owner's
 * business.
 */
export function sessionSharesQueryKey(installation: string, sessionId: string) {
  return [
    'agent-platform',
    'kagent',
    'session-shares',
    installation,
    sessionId,
  ] as const;
}

/**
 * The shares that exist for one session.
 *
 * Read only while the dialog is open (`enabled`), and re-read on every open
 * (`staleTime: 0`): a share may have been revoked from another tab or by the
 * controller's own expiry, and a list that is about to offer a revoke button
 * should not be a minute old.
 */
export function useSessionShares(
  installation: string,
  sessionId: string,
  { enabled }: { enabled: boolean },
) {
  const kagentApi = useApi(kagentApiRef);

  const query = useQuery({
    queryKey: sessionSharesQueryKey(installation, sessionId),
    queryFn: () => kagentApi.listSessionShares(installation, sessionId),
    enabled,
    staleTime: 0,
  });

  return useMemo(
    () => ({
      shares: query.data ?? [],
      isLoading: query.isLoading && enabled,
      error: (query.error as Error | null) ?? null,
    }),
    [query.data, query.isLoading, query.error, enabled],
  );
}
