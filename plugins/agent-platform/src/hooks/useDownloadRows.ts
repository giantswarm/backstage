import { useCallback, useEffect, useMemo, useState } from 'react';

import type {
  ServedModelDownloadRow,
  ServedModelRow,
} from '../components/ServingPage/ServedModelsTable';
import { isJobActive } from '../lib/modelManager';
import type { ServingBackend } from '../lib/serving';
import { usePullJobs, type PullJob, type PullJobs } from './usePullJobs';

/**
 * Where the dismissed failures are remembered: per tab, for as long as the
 * tab lives — the same lifetime as the jobs themselves have in model-manager's
 * memory, give or take a restart. A page reload keeps them dismissed; a new
 * tab starts clean, as the jobs list does for a new model-manager.
 */
export const DISMISSED_DOWNLOADS_STORAGE_KEY =
  'agent-platform.dismissed-downloads';

/** The key a dismissal is remembered under: installation + job. */
export function downloadKey(job: Pick<PullJob, 'installation' | 'id'>): string {
  return `${job.installation}/${job.id}`;
}

function readDismissed(): Set<string> {
  try {
    const raw = window.sessionStorage.getItem(DISMISSED_DOWNLOADS_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((key): key is string => typeof key === 'string')
        : [],
    );
  } catch {
    return new Set();
  }
}

function writeDismissed(keys: Set<string>) {
  try {
    window.sessionStorage.setItem(
      DISMISSED_DOWNLOADS_STORAGE_KEY,
      JSON.stringify(Array.from(keys)),
    );
  } catch {
    // Storage unavailable (private mode, quota): the dismissal lasts for the
    // component's lifetime, which is still better than a card that never lets go.
  }
}

/**
 * The failed downloads the user has dismissed, remembered per tab. A failed
 * pull stays in model-manager's job list (it keeps the last few hundred), so
 * without this the row would come back on every visit to the view.
 */
export function useDismissedDownloads(): [
  Set<string>,
  (job: Pick<PullJob, 'installation' | 'id'>) => void,
] {
  const [dismissed, setDismissed] = useState<Set<string>>(readDismissed);
  const dismiss = useCallback((job: Pick<PullJob, 'installation' | 'id'>) => {
    setDismissed(current => {
      const next = new Set(current);
      next.add(downloadKey(job));
      writeDismissed(next);
      return next;
    });
  }, []);
  return [dismissed, dismiss];
}

/**
 * A pull job as a row of the served-models table, in the group of the
 * installation's backend, named after the pulled reference so it sorts among
 * the models it will land next to. `downloading` while in flight, `notReady`
 * once failed — the shared readiness vocabulary, nothing new. Carries the node
 * when the job names one (a per-node download on KServe), so the group's
 * placement column places it; nothing points at it, nothing operates on it
 * but the job's own controls.
 */
export function toDownloadRow(
  job: PullJob,
  backend: ServingBackend,
): ServedModelDownloadRow {
  const failed = job.phase === 'failed';
  let readinessMessage: string;
  if (failed) {
    readinessMessage = job.error
      ? `The pull failed: ${job.error}`
      : 'The pull failed.';
  } else {
    readinessMessage = job.wire
      ? 'Being pulled onto the backend; its model config is created once the pull completes.'
      : 'Being pulled onto the backend.';
  }
  return {
    kind: 'download',
    id: `${job.installation}/${backend}/download/${job.id}`,
    installation: job.installation,
    backend,
    name: job.model,
    readiness: failed ? 'notReady' : 'downloading',
    readinessMessage,
    node: job.node,
    endpointHosts: [],
    operable: false,
    usedBy: [],
    download: {
      jobId: job.id,
      phase: job.phase,
      status: job.status,
      bytesCompleted: job.bytesCompleted,
      bytesTotal: job.bytesTotal,
      percent: job.percent,
      error: job.error,
      wire: job.wire,
    },
  };
}

/**
 * The jobs worth a row: pulls in flight, and pulls that failed and were not
 * dismissed. A finished pull is not one — its model is in the inventory the
 * moment the job completes (usePullJobs invalidates it), a cancelled one left
 * nothing behind; both vanish at once rather than duplicating the row above
 * or lingering as history. `load` jobs (KServe: following an InferenceService
 * to readiness) are not downloads; the InferenceService row already tells.
 * Jobs of an installation whose backend is unknown have no group to join.
 */
export function downloadRowsFor(
  jobs: PullJob[],
  backends: Record<string, ServingBackend | undefined>,
  dismissed: Set<string> = new Set(),
): ServedModelDownloadRow[] {
  const rows: ServedModelDownloadRow[] = [];
  for (const job of jobs) {
    if (job.type === 'load') {
      continue;
    }
    if (!isJobActive(job) && job.phase !== 'failed') {
      continue;
    }
    if (job.phase === 'failed' && dismissed.has(downloadKey(job))) {
      continue;
    }
    const backend = backends[job.installation];
    if (!backend) {
      continue;
    }
    rows.push(toDownloadRow(job, backend));
  }
  return rows;
}

export type DownloadRows = {
  /** The pulls in flight and the undismissed failures, as table rows. */
  rows: ServedModelDownloadRow[];
  /** Installations whose job list could not be read. */
  errors: PullJobs['errors'];
  /** Take a failed download off the table (remembered per tab). */
  dismiss: (row: ServedModelDownloadRow) => void;
};

/**
 * The download rows of the installations that can pull — the Serving view's
 * half of the jobs list, next to the served models; the other half, that a
 * finished job refreshes the inventory, stays in usePullJobs. Polls as that
 * hook does: fast while a pull runs, slowly otherwise.
 */
export function useDownloadRows(
  installations: string[],
  backends: Record<string, ServingBackend | undefined>,
): DownloadRows {
  const { jobs, errors } = usePullJobs(installations);
  const [dismissed, dismissJob] = useDismissedDownloads();

  const rows = useMemo(
    () => downloadRowsFor(jobs, backends, dismissed),
    [jobs, backends, dismissed],
  );

  // A dismissal outlives the job only as long as model-manager remembers the
  // job; once the job is gone from every list, forget the dismissal too so
  // the storage does not grow with every failure ever seen.
  useEffect(() => {
    const known = new Set(jobs.map(downloadKey));
    const stale = Array.from(dismissed).filter(key => !known.has(key));
    if (stale.length > 0 && jobs.length > 0) {
      const next = new Set(Array.from(dismissed).filter(key => known.has(key)));
      writeDismissed(next);
    }
  }, [jobs, dismissed]);

  const dismiss = useCallback(
    (row: ServedModelDownloadRow) =>
      dismissJob({ installation: row.installation, id: row.download.jobId }),
    [dismissJob],
  );

  return useMemo(() => ({ rows, errors, dismiss }), [rows, errors, dismiss]);
}

/** Served rows and download rows together, the table sorting each group by name. */
export function withDownloadRows(
  rows: ServedModelRow[],
  downloads: ServedModelDownloadRow[],
): ServedModelRow[] {
  return downloads.length === 0 ? rows : [...rows, ...downloads];
}
