import type {
  WorkflowExecutionListResponse,
  WorkflowExecutionStatus,
} from '../../apis/types';

/**
 * How many of the installation's newest runs the Last run filter reads, in one
 * request. One per workflow would be 300 requests at 300 workflows (the
 * list-scale fix the table's per-page run queries exist for); muster lists
 * executions newest first and caps a page at 1000.
 */
export const LAST_RUNS_WINDOW = 500;

/** A workflow's last run as the Last run filter buckets it. */
export type LastRunState =
  'failed' | 'running' | 'succeeded' | 'never' | 'not-recent';

export const LAST_RUN_LABELS: Record<LastRunState, string> = {
  failed: 'Failed',
  running: 'Running',
  succeeded: 'Succeeded',
  never: 'Not run yet',
  'not-recent': 'No recent run',
};

export const LAST_RUN_ORDER: readonly LastRunState[] = [
  'failed',
  'running',
  'succeeded',
  'never',
  'not-recent',
];

const STATUS_STATE: Partial<Record<WorkflowExecutionStatus, LastRunState>> = {
  failed: 'failed',
  inprogress: 'running',
  completed: 'succeeded',
};

/**
 * Each workflow's last-run state off one page of the installation's newest
 * runs. A workflow absent from the page has never run when the page holds
 * every run; when it does not (`has_more`), all that is known is that it did
 * not run lately — said so, rather than claiming it never ran.
 */
export function lastRunStates(
  response: WorkflowExecutionListResponse,
): (workflowName: string) => LastRunState | undefined {
  const latest = new Map<string, WorkflowExecutionStatus>();
  for (const execution of response.executions ?? []) {
    if (!latest.has(execution.workflow_name)) {
      latest.set(execution.workflow_name, execution.status);
    }
  }
  return workflowName => {
    const status = latest.get(workflowName);
    if (status === undefined) {
      return response.has_more ? 'not-recent' : 'never';
    }
    return STATUS_STATE[status];
  };
}
