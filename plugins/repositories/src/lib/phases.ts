import {
  InventoryRecord,
  SetupStep,
  Watch,
  WATCH_PHASES,
  WatchPhaseName,
} from '../apis';

/**
 * The phases of a repository's set-up as the page follows them -- a new
 * repository through `watch_repository`, an Align now through the record's
 * pending run turning into its last run -- in one shape the phase list
 * renders. Nothing here asks anything; the derivations are pure so the list
 * can be tested against the manager's answers.
 */

/** How far a phase has come. */
export type PhaseState = 'done' | 'pending' | 'failed' | 'ahead';

/** A link a done or failed phase stands for: the repository, the pull request, the release, the run. */
export interface PhaseLink {
  href: string;
  text: string;
}

export interface PhaseItem {
  name: string;
  /** The phase for a person: Created, Scaffolded, … */
  label: string;
  state: PhaseState;
  /** When the phase was reached; done phases only. */
  at?: string;
  /** Seconds from the first phase (the creation, the dispatch) to this one; done phases only. */
  sinceStart?: number;
  /** Seconds since the phase before, as the manager counts them; done phases only. */
  seconds?: number;
  /** One line on a done phase: the release's tag, the run's verdict. */
  detail?: string;
  /** Why the phase waits (pending) or failed (failed), in the manager's words. */
  reason?: string;
  link?: PhaseLink;
}

/** The phases for a person, in the manager's order. */
export const PHASE_LABELS: Record<WatchPhaseName, string> = {
  created: 'Created',
  scaffolded: 'Scaffolded',
  declared: 'Declared',
  merged: 'Merged',
  setUp: 'Set up',
  released: 'Released',
};

/**
 * What a phase waits for while the manager gives no reason -- the phase is
 * simply not reached yet -- taken from what `watch_repository` decides each
 * phase on.
 */
const WAITING: Record<WatchPhaseName, string> = {
  created: 'the repository does not exist on GitHub yet',
  scaffolded: 'the default branch does not carry the scaffold commit yet',
  declared: 'the declaration pull request is not open yet',
  merged: 'the declaration pull request has not merged yet',
  setUp: 'the reconciler run of the pull request has not reported yet',
  released:
    'the first release does not exist yet, or CircleCI has not reported on its commit',
};

/** What failed, as the title over the manager's reason. */
export const FAILURE_TITLES: Record<WatchPhaseName, string> = {
  created: 'The repository was not created',
  scaffolded: 'The scaffold was not pushed',
  declared: 'The declaration pull request is not the repository’s',
  merged: 'The declaration pull request did not merge',
  setUp: 'The set-up failed',
  released: 'The first release failed',
};

const isWatchPhase = (name: string): name is WatchPhaseName =>
  (WATCH_PHASES as readonly string[]).includes(name);

export const phaseLabel = (name: string): string =>
  isWatchPhase(name) ? PHASE_LABELS[name] : name;

export const failureTitle = (phase: string): string =>
  isWatchPhase(phase) ? FAILURE_TITLES[phase] : `${phase} failed`;

const secondsBetween = (from: string, to: string): number =>
  Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 1000));

/** `12 s`, `1 min 15 s`, `1 h 2 min`: a duration a person reads at a glance. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) {
    return `${s} s`;
  }
  const minutes = Math.floor(s / 60);
  if (minutes < 60) {
    const rest = s % 60;
    return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
  }
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes === 0 ? `${hours} h` : `${hours} h ${restMinutes} min`;
}

/** The link a done phase of a creation stands for, where the answer carries one. */
function watchLink(name: string, watch: Watch): PhaseLink | undefined {
  switch (name) {
    case 'created':
      return watch.repository
        ? { href: watch.repository, text: 'repository' }
        : undefined;
    case 'declared':
    case 'merged':
      return watch.pullRequest
        ? { href: watch.pullRequest, text: 'pull request' }
        : undefined;
    case 'released':
      return watch.release
        ? { href: watch.release.url, text: watch.release.tag }
        : undefined;
    default:
      return undefined;
  }
}

/**
 * The phases of a new repository as `watch_repository` answered: the ones
 * done with when and how long after the creation, the one pending with the
 * manager's reason (or what it waits for), the one failed with the reason,
 * the rest ahead. The manager's order is kept; a phase it names that the
 * page does not know is shown all the same.
 */
export function watchPhases(watch: Watch): PhaseItem[] {
  const done = new Map(watch.phases.map(phase => [phase.name, phase]));
  const names = [
    ...watch.phases.map(phase => phase.name),
    ...WATCH_PHASES.filter(name => !done.has(name)),
  ];
  const start = watch.phases[0]?.at;
  return names.map(name => {
    const label = phaseLabel(name);
    const phase = done.get(name);
    if (phase) {
      return {
        name,
        label,
        state: 'done',
        at: phase.at,
        sinceStart: start ? secondsBetween(start, phase.at) : 0,
        seconds: phase.seconds,
        link: watchLink(name, watch),
      };
    }
    if (watch.failure?.phase === name) {
      return {
        name,
        label,
        state: 'failed',
        reason: watch.failure.reason,
        link: watchLink(name, watch),
      };
    }
    if (!watch.failure && !watch.ready && watch.pending === name) {
      return {
        name,
        label,
        state: 'pending',
        reason:
          watch.pendingReason ||
          (isWatchPhase(name) ? WAITING[name] : undefined),
      };
    }
    return { name, label, state: 'ahead' };
  });
}

/** Nothing left to wait for: no phase is pending (every one done, or one failed). */
export const phasesSettled = (phases: PhaseItem[]): boolean =>
  !phases.some(phase => phase.state === 'pending');

/** The steps of a run that could not run, as the manager words a failed set-up. */
const failedSteps = (steps: SetupStep[]): string =>
  steps
    .filter(step => step.verdict === 'failed')
    .map(step => `the ${step.step} step failed: ${step.summary ?? ''}`.trim())
    .join('; ');

/** One line on a reported run: converged, or the steps that are not ok. */
export function runDetail(steps: SetupStep[], converged: boolean): string {
  if (converged) {
    return 'converged';
  }
  const notOk = steps.filter(
    step => step.verdict !== 'ok' && step.verdict !== 'skipped',
  );
  return `not converged: ${notOk.map(step => `${step.step} ${step.verdict}`).join(', ')}`;
}

/** The finding the inventory leaves for an expected run that never reported. */
export const RUN_MISSING = 'reconcile-run-missing';

/**
 * The two phases of an Align now dispatched at `since`, from the record as
 * the manager keeps it: the dispatch (the record's pending run, or the
 * moment the dialog dispatched), then the run's report -- the record's last
 * run once it is one that followed the dispatch, with the run's verdict;
 * failed steps fail the phase, and so does the pending window running out
 * (the record's missing run, with the inventory's finding as the reason).
 */
export function alignmentPhases(
  record: InventoryRecord | undefined,
  since: string,
): PhaseItem[] {
  const setup = record?.setup;
  const pending =
    setup?.pendingRun && !setup.pendingRun.pullRequest
      ? setup.pendingRun
      : undefined;
  const dispatchedAt = pending?.dispatchedAt ?? since;
  const dispatched: PhaseItem = {
    name: 'dispatched',
    label: 'Dispatched',
    state: 'done',
    at: dispatchedAt,
    sinceStart: 0,
    seconds: 0,
    detail: pending?.by ? `by ${pending.by}` : undefined,
  };

  const run = setup?.lastRun;
  const followed =
    run &&
    Date.parse(run.timestamp) >= Date.parse(since) &&
    (run.change === undefined || run.change.kind === 'dispatched');
  if (run && followed) {
    const failed = failedSteps(run.result.steps);
    return [
      dispatched,
      {
        name: 'reported',
        label: 'Reported',
        state: failed ? 'failed' : 'done',
        at: run.timestamp,
        sinceStart: secondsBetween(dispatchedAt, run.timestamp),
        seconds: secondsBetween(dispatchedAt, run.timestamp),
        detail: failed
          ? undefined
          : runDetail(run.result.steps, run.result.converged),
        reason: failed || undefined,
        link: { href: run.runUrl, text: 'run' },
      },
    ];
  }

  const missing = setup?.missingRun;
  if (
    missing &&
    !missing.pullRequest &&
    Date.parse(missing.noticedAt) >= Date.parse(since)
  ) {
    const finding = record?.findings.find(f => f.kind === RUN_MISSING);
    return [
      dispatched,
      {
        name: 'reported',
        label: 'Reported',
        state: 'failed',
        reason:
          finding?.message ??
          'the run did not report within the pending window',
        link: { href: missing.runsUrl, text: 'workflow runs' },
      },
    ];
  }

  return [
    dispatched,
    {
      name: 'reported',
      label: 'Reported',
      state: 'pending',
      reason: pending
        ? `the run has not reported yet; the record expects it since ${pending.dispatchedAt}`
        : 'the run has not reported yet',
    },
  ];
}
