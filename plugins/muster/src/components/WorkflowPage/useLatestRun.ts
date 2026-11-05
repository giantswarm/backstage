import { useApi } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import { musterApiRef } from '../../apis';
import type { WorkflowExecutionSummary } from '../../apis/types';
import { workflowRunKeys } from '../../lib/workflowRunKeys';

/** The newest run of a page of summaries (muster lists newest first). */
function newestRun(
  runs: WorkflowExecutionSummary[] | null | undefined,
): WorkflowExecutionSummary | undefined {
  if (!runs || runs.length === 0) {
    return undefined;
  }
  return runs.reduce((newest, run) =>
    run.started_at > newest.started_at ? run : newest,
  );
}

/**
 * The workflow's newest run — one read shared by the flow canvas's last-run
 * overlay and the Statistics section's "Last run" (same query key, so the
 * page asks muster once). A busy workflow keeps up to 10,000 run records;
 * the page needs only the newest, and muster's totals come from
 * {@link useRunCounts}. Session-scoped: disabled without a muster session.
 */
export function useLatestRun(
  name: string,
  installation: string | undefined,
  hasSession: boolean,
) {
  const musterApi = useApi(musterApiRef);
  const query = useQuery({
    queryKey: workflowRunKeys.latest(installation, name),
    queryFn: () =>
      musterApi.listExecutions({
        workflowName: name,
        limit: 1,
        installation,
      }),
    enabled: hasSession,
    staleTime: 30_000,
  });
  return { ...query, latest: newestRun(query.data?.executions) };
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
    queryKey: workflowRunKeys.count(installation, name, status),
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
