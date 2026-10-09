import { useCallback, useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { useQueryClient } from '@tanstack/react-query';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';
import { kagentApiRef } from '../apis';
import { sessionSharesQueryKey } from './useSessionShares';

/**
 * Revoke one share of a session.
 *
 * The invalidation refetches and is awaited, like the create's: the dialog
 * stays open on the list this write just shortened, and a row that lingered
 * after its revoke resolved would read as the revoke having failed.
 */
export function useRevokeSessionShare(installation: string, sessionId: string) {
  const kagentApi = useApi(kagentApiRef);
  const queryClient = useQueryClient();

  const mutation = useTrackedMutation({
    event: null,
    untrackedReason: 'Housekeeping on a share; sessionShared measures sharing.',
    mutationFn: async (shareId: string) => {
      await kagentApi.revokeSessionShare(installation, sessionId, shareId);

      await queryClient.invalidateQueries({
        queryKey: sessionSharesQueryKey(installation, sessionId),
      });
    },
  });

  const { mutateAsync, reset } = mutation;

  const revokeShare = useCallback(
    async (shareId: string) => {
      await mutateAsync(shareId);
    },
    [mutateAsync],
  );

  return useMemo(
    () => ({
      revokeShare,
      /** The share a pending revoke names, for the one row's busy state. */
      revokingId: mutation.isPending ? mutation.variables : undefined,
      isRevoking: mutation.isPending,
      error: mutation.error as Error | null,
      reset,
    }),
    [
      revokeShare,
      mutation.isPending,
      mutation.variables,
      mutation.error,
      reset,
    ],
  );
}

/** What {@link useRevokeSessionShare} hands to the dialog. */
export type UseRevokeSessionShareResult = ReturnType<
  typeof useRevokeSessionShare
>;
