import { useCallback, useContext, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { MusterInstanceContext } from './MusterInstanceProvider';

/**
 * Delay before the follow-up refetch. A muster mutation writes the CR
 * synchronously, so spec-derived UI (e.g. the Activate/Deactivate switch on
 * `spec.suspended`) is correct on the immediate refetch -- but `status.state`
 * trails the reconciler by a beat. One short follow-up read catches the
 * settled status without waiting for the regular 30s poll.
 */
const STATUS_FOLLOW_UP_MS = 2_500;

/**
 * Returns a callback that refreshes the muster reads right after a successful
 * mutation (core_service_* lifecycle, core_mcpserver_* CRUD), instead of
 * leaving the UI stale until the next background poll -- which can be up to
 * 30s away, and further in an unfocused tab where react-query pauses
 * `refetchInterval` (and the plugin's QueryClient has focus-refetch off).
 *
 * Refreshes both read paths a mutation can invalidate: the CRD lists behind
 * the provider (`retry`) and the aggregator's runtime server list
 * (`['muster', 'servers', installation]`, used by the "Runtime (live)" block).
 * Fires once immediately and once after {@link STATUS_FOLLOW_UP_MS}.
 *
 * Tolerates a missing MusterInstanceProvider (unit tests render the dialogs
 * standalone) by degrading to the react-query invalidation alone.
 */
export function useMusterMutationRefresh(installation?: string): () => void {
  const retry = useContext(MusterInstanceContext)?.retry;
  const queryClient = useQueryClient();
  const followUp = useRef<ReturnType<typeof setTimeout>>();

  // Drop a pending follow-up on unmount; the regular poll covers the gap.
  useEffect(() => () => clearTimeout(followUp.current), []);

  return useCallback(() => {
    const refetch = () => {
      retry?.();
      if (installation) {
        queryClient.invalidateQueries({
          queryKey: ['muster', 'servers', installation],
        });
      }
    };
    refetch();
    clearTimeout(followUp.current);
    followUp.current = setTimeout(refetch, STATUS_FOLLOW_UP_MS);
  }, [retry, queryClient, installation]);
}
