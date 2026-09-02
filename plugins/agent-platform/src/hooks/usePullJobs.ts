import { useEffect, useMemo, useRef } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { modelManagerApiRef } from '../apis';
import { isJobActive, type ModelManagerJob } from '../lib/modelManager';
import {
  modelManagerJobsQueryKey,
  modelManagerModelsQueryKey,
} from '../lib/queryKeys';
import { useInvalidateModelManagerReads } from './useServedModelAction';

/** Poll cadence while a pull is running: progress is the whole point. */
export const JOBS_POLL_ACTIVE_MS = 2_000;
/**
 * Poll cadence when nothing is running. Not off: a pull started elsewhere (an
 * agent through MCP, another tab) should still show up without a reload.
 */
export const JOBS_POLL_IDLE_MS = 30_000;

/** A job, tagged with the installation it belongs to. */
export type PullJob = ModelManagerJob & { installation: string };

export type PullJobs = {
  /** Every known job across the installations, newest first. */
  jobs: PullJob[];
  /** Some lists have not answered yet. */
  isLoading: boolean;
  /** Installations whose job list could not be read. */
  errors: { installation: string; error: Error }[];
};

/**
 * The pull jobs of the installations that can pull, polled fast while any is
 * running and slowly otherwise.
 *
 * Jobs live in model-manager's memory (single replica) and this hook is the
 * only place the portal follows them, so it also owns the consequence of a job
 * finishing: when one leaves the active phases, the installation's inventory
 * and ModelConfigs are invalidated — the new model (and the ModelConfig the
 * job wired) appear without waiting for the next slow poll.
 */
export function usePullJobs(installations: string[]): PullJobs {
  const modelManagerApi = useApi(modelManagerApiRef);
  const queryClient = useQueryClient();
  const installationsKey = installations.join(',');

  const queries = useQueries({
    queries: installations.map(installation => ({
      queryKey: modelManagerJobsQueryKey(installation),
      queryFn: () => modelManagerApi.listJobs(installation),
      staleTime: 0,
      refetchInterval: (query: { state: { data?: ModelManagerJob[] } }) =>
        (query.state.data ?? []).some(isJobActive)
          ? JOBS_POLL_ACTIVE_MS
          : JOBS_POLL_IDLE_MS,
    })),
  });

  const jobs = useMemo<PullJob[]>(
    () =>
      installations
        .flatMap((installation, index) =>
          (queries[index]?.data ?? []).map(job => ({ ...job, installation })),
        )
        .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [installationsKey, ...queries.map(query => query.data)],
  );

  // Track which jobs were active last time round; any of them now terminal
  // means the installation's inventory changed.
  const previouslyActive = useRef(new Map<string, string>());
  useEffect(() => {
    const nowActive = new Map<string, string>();
    const finished = new Set<string>();
    for (const job of jobs) {
      const key = `${job.installation}/${job.id}`;
      if (isJobActive(job)) {
        nowActive.set(key, job.installation);
      } else if (previouslyActive.current.has(key)) {
        finished.add(job.installation);
      }
    }
    previouslyActive.current = nowActive;
    for (const installation of finished) {
      queryClient.invalidateQueries({
        queryKey: modelManagerModelsQueryKey(installation),
      });
      // The ModelConfig the job wired is a kubernetes-react resource; same
      // key shape as useInvalidateModelManagerReads.
      queryClient.invalidateQueries({
        queryKey: ['cluster', installation, 'list'],
      });
    }
  }, [jobs, queryClient]);

  return useMemo(
    () => ({
      jobs,
      isLoading: queries.some(query => query.isLoading),
      errors: installations.flatMap((installation, index) =>
        queries[index]?.isError
          ? [{ installation, error: queries[index].error as Error }]
          : [],
      ),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jobs, installationsKey, ...queries.map(query => query.status)],
  );
}

/**
 * Start a pull on an installation. Resolves with the job; the jobs list is
 * invalidated so the download shows up (and starts polling) at once.
 */
export function usePullModel(installation: string) {
  const modelManagerApi = useApi(modelManagerApiRef);
  const invalidate = useInvalidateModelManagerReads(installation);

  return useMutation({
    mutationFn: (request: { model: string; wire?: boolean }) =>
      modelManagerApi.pullModel(installation, request),
    onSuccess: () => invalidate(),
  });
}

/** Cancel a running job. */
export function useCancelJob(installation: string) {
  const modelManagerApi = useApi(modelManagerApiRef);
  const invalidate = useInvalidateModelManagerReads(installation);

  return useMutation({
    mutationFn: (jobId: string) =>
      modelManagerApi.cancelJob(installation, jobId),
    onSettled: () => invalidate(),
  });
}
