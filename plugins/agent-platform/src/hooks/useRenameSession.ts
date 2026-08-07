import { useCallback, useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { kagentApiRef } from '../apis';
import { sessionQueryKey } from './useSessionDetail';

/** What the caller must hand over for the backend's v0.9.x rename workaround. */
export type RenameSessionFallback = {
  /** The session's `agentId`, verbatim — kagent's encoded `ns__NS__name`. */
  agentRef?: string;
  source?: string;
};

/**
 * Rename one kagent session.
 *
 * Shaped like {@link useDeleteSession}, with two deliberate differences.
 *
 * The invalidations **refetch**, where the delete's use `refetchType: 'none'`.
 * The delete navigates away and a refetch would race that navigation with a
 * request that now 404s; a rename leaves the user exactly where they were,
 * looking at a heading that has to show the new name. Both are awaited inside
 * `mutationFn` so `isPending` covers them too, and the dialog closes onto data
 * that has already caught up rather than onto the old title.
 *
 * There is also no `isRenamed` counterpart to `isDeleted`. That flag exists to
 * hold the detail page's reads off through the gap between success and
 * navigation, and nothing here navigates.
 *
 * `fallback` is passed straight through to the backend, which needs it only on a
 * kagent too old to rename properly — see `KagentApi.renameSession`.
 */
export function useRenameSession(
  installation: string,
  sessionId: string,
  fallback: RenameSessionFallback = {},
) {
  const kagentApi = useApi(kagentApiRef);
  const queryClient = useQueryClient();

  const { agentRef, source } = fallback;

  const mutation = useMutation({
    mutationFn: async (name: string) => {
      await kagentApi.renameSession(installation, sessionId, name, {
        agentRef,
        source,
      });

      // This session's own read, so the heading and timestamps update in place.
      // The tasks read is deliberately left alone: a rename touches no task, and
      // that query polls on the faster tier anyway.
      await queryClient.invalidateQueries({
        queryKey: sessionQueryKey(installation, sessionId),
      });

      // The fleet list behind the sessions table, which shows this title in its
      // own column. Only within this tab — the Agents tab mounts its own
      // `QueryClientProvider`, so its recent-sessions card is a different cache
      // that nothing here can reach. It needs no help: a fresh client starts
      // empty and these keys are excluded from persistence.
      await queryClient.invalidateQueries({
        queryKey: ['agent-platform', 'kagent', 'sessions', installation],
      });
    },
  });

  const { mutateAsync, reset } = mutation;

  // Wrapped so callers get `Promise<void>`: `mutateAsync` resolves with the
  // mutation's return value, which is nothing anyone should depend on.
  const renameSession = useCallback(
    async (name: string) => {
      await mutateAsync(name);
    },
    [mutateAsync],
  );

  return useMemo(
    () => ({
      renameSession,
      isRenaming: mutation.isPending,
      error: mutation.error as Error | null,
      reset,
    }),
    [renameSession, mutation.isPending, mutation.error, reset],
  );
}

/** What {@link useRenameSession} hands to the rename UI. */
export type UseRenameSessionResult = ReturnType<typeof useRenameSession>;
