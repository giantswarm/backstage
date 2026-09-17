import type { LifecycleStepState } from './clusterManager';

export type { LifecycleStepState };

/**
 * One step of a long-running action, in the managers' vocabulary: the state
 * cluster-manager and model-manager report (`pending`, `inProgress`, `done`,
 * `failed`), when it began, when it finished, and what the manager says about
 * it. Knows nothing about pools or models — the `LifecycleSteps` component
 * renders a list of these for either.
 */
export type LifecycleStep = {
  id: string;
  title: string;
  state: LifecycleStepState;
  /** RFC3339: when the step began (a condition's transition, an object's creation). */
  since?: string;
  /** RFC3339: when a done step finished. */
  finishedAt?: string;
  message?: string;
  /** What the step usually takes, in seconds — shown next to a pending or running step. */
  typicalSeconds?: number;
  /** The step is the next action: offered as a link once its `state` is `done`. */
  action?: { label: string; to: string };
};

const MINUTE = 60;
const HOUR = 60 * MINUTE;

/** `3 s`, `2 min 30 s`, `12 min`, `1 h 5 min` — a span a person reads at a glance. */
export function formatSeconds(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  if (total < MINUTE) {
    return `${total} s`;
  }
  if (total < HOUR) {
    const minutes = Math.floor(total / MINUTE);
    const rest = total % MINUTE;
    return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
  }
  const hours = Math.floor(total / HOUR);
  const minutes = Math.floor((total % HOUR) / MINUTE);
  return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
}

function ago(instant: string | undefined, now: number): string | undefined {
  if (!instant) {
    return undefined;
  }
  const at = Date.parse(instant);
  if (Number.isNaN(at) || at > now) {
    return undefined;
  }
  return `${formatSeconds((now - at) / 1000)} ago`;
}

/**
 * The timing line of a step: `started 42 s ago · typ. 30 s` while it runs,
 * `took 3 s` or `done 2 min ago` once done, `failed 5 min ago`, and the
 * typical duration alone while it waits. Undefined when nothing is known.
 */
export function stepTiming(
  step: Pick<
    LifecycleStep,
    'state' | 'since' | 'finishedAt' | 'typicalSeconds'
  >,
  now: number,
): string | undefined {
  const typical =
    step.typicalSeconds !== undefined
      ? `typ. ${formatSeconds(step.typicalSeconds)}`
      : undefined;
  switch (step.state) {
    case 'inProgress': {
      const started = ago(step.since, now);
      return [started && `started ${started}`, typical]
        .filter(Boolean)
        .join(' · ');
    }
    case 'done': {
      if (step.since && step.finishedAt) {
        const took =
          (Date.parse(step.finishedAt) - Date.parse(step.since)) / 1000;
        if (took > 0) {
          return `took ${formatSeconds(took)}`;
        }
      }
      const finished = ago(step.finishedAt ?? step.since, now);
      return finished ? `done ${finished}` : undefined;
    }
    case 'failed': {
      const failed = ago(step.since, now);
      return failed ? `failed ${failed}` : 'failed';
    }
    default:
      return typical;
  }
}
