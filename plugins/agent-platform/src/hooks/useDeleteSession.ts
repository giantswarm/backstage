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

      // The fleet list `SessionsDataProvider` reads — the page the caller is about
      // to navigate back to.
      //
      // Only within this tab. `useAgentSessions` reads the same *key* for the agent
      // page's recent-sessions card, but the Agents tab mounts its own
      // `QueryClientProvider` (a fresh `new QueryClient` per mount), so that cache
      // is not this one and nothing here can invalidate it. It needs no help: a
      // fresh client starts empty, and these keys are excluded from persistence, so
      // the card refetches when the tab mounts. Do not read cross-tab correctness
      // into this call.
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
      //
      // This alone is **not** enough now that both reads carry a refetch interval:
      // `refetchType` governs invalidation-driven refetches only, and a scheduled
      // tick is neither invalidation-driven nor stopped by it. The window is real —
      // the `invalidateQueries` above does refetch the fleet list, so a full round
      // trip separates the delete from the caller's `navigate()`. What actually
      // holds the race off is the page disabling both reads for the duration; see
      // `isDeleted` below and its use in `SessionDetailPage`.
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
      /**
       * Stays true after the mutation settles, unlike `isDeleting`. The page keeps
       * its reads switched off through the gap between success and the caller's
       * navigation, which `isDeleting` alone would reopen.
       */
      isDeleted: mutation.isSuccess,
      error: mutation.error as Error | null,
      reset,
    }),
    [
      deleteSession,
      mutation.isPending,
      mutation.isSuccess,
      mutation.error,
      reset,
    ],
  );
}

/** What {@link useDeleteSession} hands to the confirmation UI. */
export type UseDeleteSessionResult = ReturnType<typeof useDeleteSession>;
