/**
 * The Deploy / Commit choice of the Create cluster and Delete cluster dialogs,
 * judged from cluster-manager's own dry runs: the portal decides nothing about
 * git or the installation itself (giantswarm/backstage#2624).
 */

import {
  classifyNodePoolWriteFailure,
  isNothingLeft,
  type ClusterWriteResult,
  type NodePoolWriteFailure,
  type WriteMode,
} from './clusterManager';

/** One mode's dry run: its answer, its refusal, or not offered at all. */
export type ModeVerdict =
  | { state: 'ready'; result: ClusterWriteResult }
  | { state: 'refused'; failure: NodePoolWriteFailure }
  | { state: 'unavailable'; reason: string };

export type ModeVerdicts = Record<WriteMode, ModeVerdict>;

/** Why Commit is not offered where this installation's cluster-manager does not take it. */
export const COMMIT_NOT_OFFERED =
  "This installation's cluster-manager does not open pull requests: it is not registered with its GitHub App.";

/** A settled dry run as its verdict. */
export function verdictOf(
  settled: PromiseSettledResult<ClusterWriteResult>,
): ModeVerdict {
  return settled.status === 'fulfilled'
    ? { state: 'ready', result: settled.value }
    : {
        state: 'refused',
        failure: classifyNodePoolWriteFailure(settled.reason),
      };
}

/**
 * Runs the dry run of every mode offered, side by side: Commit only where the
 * installation's cluster-manager takes it for the tool, Deploy always.
 */
export async function judgeModes(
  dryRun: (mode: WriteMode) => Promise<ClusterWriteResult>,
  commitOffered: boolean,
): Promise<ModeVerdicts> {
  const [apply, commit] = await Promise.allSettled([
    dryRun('apply'),
    commitOffered
      ? dryRun('commit')
      : Promise.reject(new Error(COMMIT_NOT_OFFERED)),
  ]);
  return {
    apply: verdictOf(apply),
    commit: commitOffered
      ? verdictOf(commit)
      : { state: 'unavailable', reason: COMMIT_NOT_OFFERED },
  };
}

/**
 * The mode preselected: Commit where git owns the organization (its dry run
 * passed), else Deploy where that passed; `undefined` when neither did.
 */
export function preferredMode(
  verdicts: ModeVerdicts | undefined,
): WriteMode | undefined {
  if (verdicts?.commit.state === 'ready') {
    return 'commit';
  }
  return verdicts?.apply.state === 'ready' ? 'apply' : undefined;
}

/** The dry run the review shows: Deploy's where it passed, else Commit's. */
export function previewOf(
  verdicts: ModeVerdicts | undefined,
): ClusterWriteResult | undefined {
  if (verdicts?.apply.state === 'ready') {
    return verdicts.apply.result;
  }
  return verdicts?.commit.state === 'ready'
    ? verdicts.commit.result
    : undefined;
}

/** Why a mode cannot be chosen, in cluster-manager's words; `undefined` when it can. */
export function modeBlocker(
  verdict: ModeVerdict | undefined,
): string | undefined {
  if (!verdict || verdict.state === 'ready') {
    return undefined;
  }
  return verdict.state === 'refused' ? verdict.failure.message : verdict.reason;
}

/** The refusals of the dry runs, Deploy's first. */
function failuresOf(
  verdicts: ModeVerdicts | undefined,
): NodePoolWriteFailure[] {
  return [verdicts?.apply, verdicts?.commit].flatMap(verdict =>
    verdict?.state === 'refused' ? [verdict.failure] : [],
  );
}

/** The first "not connected" answer of the dry runs: the connect step is shown for it. */
export function notConnectedOf(
  verdicts: ModeVerdicts | undefined,
): NodePoolWriteFailure | undefined {
  return failuresOf(verdicts).find(failure => failure.kind === 'not-connected');
}

/** Whether a dry run answered that nothing of the cluster is left: it is already removed. */
export function nothingLeftOf(verdicts: ModeVerdicts | undefined): boolean {
  return failuresOf(verdicts).some(isNothingLeft);
}
