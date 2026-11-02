import type { QueryClient } from '@tanstack/react-query';

/** The prefix every query fed by workflow runs shares. */
const RUN_RECORDS = 'workflow-run-records';

/**
 * Query keys of everything muster's workflow run records feed: a workflow's
 * latest run, its run counts and statistics, and the installation's newest
 * runs. One factory, under one prefix, so a run refreshes them all through
 * {@link invalidateWorkflowRuns} and a new one cannot be left out.
 */
export const workflowRunKeys = {
  /** The installation-wide records, the prefix of each. */
  installation: (installation: string | undefined) =>
    ['muster', RUN_RECORDS, installation, 'installation'] as const,
  /** One workflow's records, the prefix of each. */
  workflow: (installation: string | undefined, name: string) =>
    ['muster', RUN_RECORDS, installation, 'workflow', name] as const,
  /** Its newest run (a one-row page, whose `total` counts every run). */
  latest: (installation: string | undefined, name: string) =>
    [...workflowRunKeys.workflow(installation, name), 'latest'] as const,
  /** How many of its runs ended in the status. */
  count: (
    installation: string | undefined,
    name: string,
    status: 'completed' | 'failed',
  ) =>
    [...workflowRunKeys.workflow(installation, name), 'count', status] as const,
  /** muster's statistics of it. */
  stats: (installation: string | undefined, name: string) =>
    [...workflowRunKeys.workflow(installation, name), 'stats'] as const,
  /** The installation's newest runs, of any workflow. */
  lastRuns: (installation: string | undefined) =>
    [...workflowRunKeys.installation(installation), 'last-runs'] as const,
};

/**
 * Marks stale what runs of the named workflows changed: their own records
 * and the installation's newest runs. A run of one workflow leaves the other
 * workflows' records alone, except those it runs as steps, which the caller
 * names too.
 */
export function invalidateWorkflowRuns(
  queryClient: QueryClient,
  installation: string | undefined,
  names: string[],
) {
  queryClient.invalidateQueries({
    queryKey: workflowRunKeys.installation(installation),
  });
  for (const name of names) {
    queryClient.invalidateQueries({
      queryKey: workflowRunKeys.workflow(installation, name),
    });
  }
}
