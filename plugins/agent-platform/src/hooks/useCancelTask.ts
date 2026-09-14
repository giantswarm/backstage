import { useCallback, useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { kagentApiRef } from '../apis';
import { sessionQueryKey, sessionTasksQueryKey } from './useSessionDetail';

/**
 * Stop the turn a session is running.
 *
 * The composer's Stop control. Deliberately not "abort the stream": cutting the
 * relay leaves the agent working and the poll shows it finish, which is the
 * opposite of what someone pressing Stop wants. This cancels the **task on the
 * server** — the controller ends the run and records it canceled — so the turn
 * stays stopped when the tab is closed.
 *
 * Shaped like the other session mutations: the conversation is invalidated
 * inside `mutationFn`, so `isPending` covers the refresh and the page shows
 * the canceled turn rather than a spinner that lingers.
 */
export function useCancelTask(installation: string, sessionId: string) {
  const kagentApi = useApi(kagentApiRef);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (taskId: string) => {
      await kagentApi.cancelTask(installation, sessionId, taskId);
      // The task is now terminal: read the conversation back so the badge, the
      // working indicator and the composer all follow at once.
      await queryClient.invalidateQueries({
        queryKey: sessionTasksQueryKey(installation, sessionId),
      });
      await queryClient.invalidateQueries({
        queryKey: sessionQueryKey(installation, sessionId),
      });
    },
  });

  const { mutateAsync, reset } = mutation;

  const cancelTask = useCallback(
    async (taskId: string) => {
      await mutateAsync(taskId);
    },
    [mutateAsync],
  );

  return useMemo(
    () => ({
      cancelTask,
      isCancelling: mutation.isPending,
      error: mutation.error as Error | null,
      reset,
    }),
    [cancelTask, mutation.isPending, mutation.error, reset],
  );
}

export type UseCancelTaskResult = ReturnType<typeof useCancelTask>;
