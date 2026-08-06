import { useCallback, useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { kagentApiRef } from '../apis';
import { sessionQueryKey, sessionTasksQueryKey } from './useSessionDetail';

/**
 * Delete one kagent session.
 *
 * Much smaller than {@link useDeleteAgent}, because a session is not a Kubernetes
 * object: there is no owning resource to resolve, no `SelfSubjectAccessReview` to
 * consult, and nothing to clean up afterwards. kagent authorizes the call from the
 * forwarded token alone, so there is no "may I?" to answer before offering the
 * action — hence no `isDeletable`/`isCheckingDeletable` counterpart here.
 *
 * The delete is **soft** on kagent's side and effectively total on ours: the row
 * keeps its events and tasks, and every kagent read filters it out.
 */
export function useDeleteSession(installation: string, sessionId: string) {
  const kagentApi = useApi(kagentApiRef);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      await kagentApi.deleteSession(installation, sessionId);

      // The one key that matters, and it is shared: `SessionsDataProvider` and
      // `useAgentSessions` read the fleet list under it, so this corrects both the
      // sessions list the user is about to land on and the agent page's recent
      // sessions card.
      await queryClient.invalidateQueries({
        queryKey: ['agent-platform', 'kagent', 'sessions', installation],
      });

      // This session's own reads are marked stale but deliberately *not*
      // refetched. The detail page is still mounted at this point — it is where the
      // delete was triggered from — so a refetch would race the caller's navigation
      // with a request that now 404s, flashing "Session not found" underneath
      // someone who already knows. `refetchType: 'none'` leaves the entries stale
      // instead, so a later visit to the same URL revalidates and lands on the
      // not-found state properly.
      await Promise.all(
        [
          sessionQueryKey(installation, sessionId),
          sessionTasksQueryKey(installation, sessionId),
        ].map(queryKey =>
          queryClient.invalidateQueries({ queryKey, refetchType: 'none' }),
        ),
      );
    },
  });

  const { mutateAsync, reset } = mutation;

  // Wrapped so callers get `Promise<void>`: `mutateAsync` resolves with the
  // mutation's return value, which is nothing anyone should start depending on.
  const deleteSession = useCallback(async () => {
    await mutateAsync();
  }, [mutateAsync]);

  return useMemo(
    () => ({
      deleteSession,
      isDeleting: mutation.isPending,
      error: mutation.error as Error | null,
      reset,
    }),
    [deleteSession, mutation.isPending, mutation.error, reset],
  );
}

/** What {@link useDeleteSession} hands to the confirmation UI. */
export type UseDeleteSessionResult = ReturnType<typeof useDeleteSession>;
