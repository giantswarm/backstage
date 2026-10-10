import { useApi } from '@backstage/frontend-plugin-api';
import { useQueries, useQuery } from '@tanstack/react-query';
import { musterApiRef } from '../../apis';

/**
 * How many recent runs the page reads (and the runs section lists). A busy
 * workflow keeps up to 10,000 run records; the page shows a handful and the
 * totals live in the details panel.
 */
export const RECENT_RUNS_LIMIT = 5;

/**
 * The workflow's most recent runs, newest first — one read shared by the runs
 * section and the flow canvas's last-run overlay (same query key, so the page
 * asks muster once). Session-scoped: disabled without a muster session.
 */
export function useRecentRuns(
  name: string,
  installation: string | undefined,
  hasSession: boolean,
) {
  const musterApi = useApi(musterApiRef);
  return useQuery({
    queryKey: ['muster', 'workflow-recent-runs', installation, name],
    queryFn: () =>
      musterApi.listExecutions({
        workflowName: name,
        limit: RECENT_RUNS_LIMIT,
        installation,
      }),
    enabled: hasSession,
    staleTime: 30_000,
  });
}

/**
 * How many older runs each *Show older runs* click reads, past the first
 * {@link RECENT_RUNS_LIMIT}.
 */
export const OLDER_RUNS_PAGE = 20;

/**
 * The runs older than the first {@link RECENT_RUNS_LIMIT}, read
 * {@link OLDER_RUNS_PAGE} at a time with muster's `offset` — one query per
 * page the person asked for (`pages`, 0 reads nothing), newest first. Kept apart
 * from {@link useRecentRuns} so the canvas's last-run overlay never waits on
 * them.
 */
export function useOlderRuns(
  name: string,
  installation: string | undefined,
  hasSession: boolean,
  pages: number,
) {
  const musterApi = useApi(musterApiRef);
  return useQueries({
    queries: Array.from({ length: pages }, (_, page) => {
      const offset = RECENT_RUNS_LIMIT + page * OLDER_RUNS_PAGE;
      return {
        queryKey: ['muster', 'workflow-older-runs', installation, name, offset],
        queryFn: () =>
          musterApi.listExecutions({
            workflowName: name,
            limit: OLDER_RUNS_PAGE,
            offset,
            installation,
          }),
        enabled: hasSession,
        staleTime: 30_000,
      };
    }),
  });
}

/**
 * How many recorded runs succeeded and failed — muster's own totals per
 * status (`total` of a one-row page filtered by status), not a count over a
 * sample. Undefined until both are read, or without a session.
 */
export function useRunCounts(
  name: string,
  installation: string | undefined,
  hasSession: boolean,
): { succeeded: number; failed: number } | undefined {
  const musterApi = useApi(musterApiRef);
  const count = (status: 'completed' | 'failed') => ({
    queryKey: ['muster', 'workflow-run-count', installation, name, status],
    queryFn: () =>
      musterApi.listExecutions({
        workflowName: name,
        status,
        limit: 1,
        installation,
      }),
    enabled: hasSession,
    staleTime: 30_000,
  });
  const succeeded = useQuery(count('completed'));
  const failed = useQuery(count('failed'));
  if (!succeeded.data || !failed.data) {
    return undefined;
  }
  return { succeeded: succeeded.data.total, failed: failed.data.total };
}
