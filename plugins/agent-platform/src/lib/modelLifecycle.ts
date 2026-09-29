import type { LifecycleStep } from './lifecycle';
import { formatBytes } from './modelManagerServing';
import {
  explanationWithoutReason,
  type ServedModel,
  type ServedModelStep,
} from './serving';

/**
 * The served model's timeline for `LifecycleSteps`: model-manager's seven
 * steps (`scheduling` … `ready`) in the portal's words, with what each
 * usually takes and what the weights step says about the download. Pure —
 * the wire shapes are `lib/modelManager`'s, the seam's `lib/serving`'s. The
 * pool counterpart is `lib/poolLifecycle.ts`.
 */

/** Poll the inventory every 10 s while a served model is on its way (or on its way out). */
export const MODEL_POLL_ACTIVE_MS = 10_000;

/** What each step took in proof 1 on gazelle (seconds): the "typ." figures. */
export const MODEL_TYPICAL_SECONDS = {
  /** The scheduler nominates a node (Karpenter's NodeClaim) within a minute. */
  scheduling: 35,
  /** The node launches (≈ 3.5 min) and its GPU becomes allocatable (+ 1 min). */
  nodeStarting: 270,
  /** 72 s per 8 GB of weights — see {@link weightsTypicalSeconds}; 0.3 s when cached. */
  downloadingWeights: 72,
  /** The runtime image (`llm-d-cuda`) pulls in about 4 min. */
  pullingImage: 240,
  /** vLLM loads the model in about a minute. */
  loading: 60,
  /** The HTTPRoute is accepted within seconds. */
  routing: 5,
} as const;

const BYTES_PER_TYPICAL_DOWNLOAD = 8_000_000_000;

/** The download's typical duration at proof 1's 72 s per 8 GB, scaled to the weights' size. */
export function weightsTypicalSeconds(bytesTotal: number | undefined): number {
  if (!bytesTotal || bytesTotal <= 0) {
    return MODEL_TYPICAL_SECONDS.downloadingWeights;
  }
  return Math.max(
    1,
    Math.round(
      (MODEL_TYPICAL_SECONDS.downloadingWeights * bytesTotal) /
        BYTES_PER_TYPICAL_DOWNLOAD,
    ),
  );
}

/** The step names in order and the portal's title for each. */
export const MODEL_STEP_TITLES: Record<string, string> = {
  scheduling: 'Predictor pod scheduled',
  nodeStarting: 'GPU node started',
  downloadingWeights: 'Weights in the cache',
  pullingImage: 'Runtime image pulled',
  loading: 'Model loaded by vLLM',
  routing: 'Route ready',
  ready: 'Endpoint answers',
};

/**
 * What the weights step says: the progress while the download runs (bytes
 * where the cache agent reports them, else model-manager's text), `cached`
 * once the claim turned out to hold the weights, the size downloaded
 * otherwise.
 */
export function weightsMessage(step: ServedModelStep): string | undefined {
  if (step.state === 'done') {
    if (step.cached === true) {
      return 'cached — the claim already held the weights';
    }
    if (step.cached === false && step.bytesTotal) {
      return `${formatBytes(step.bytesTotal)} downloaded`;
    }
    return step.message;
  }
  if (
    step.state === 'inProgress' &&
    step.bytesCompleted !== undefined &&
    step.bytesTotal
  ) {
    return `${formatBytes(step.bytesCompleted)} of ${formatBytes(step.bytesTotal)}`;
  }
  return (
    step.message ?? (step.bytesTotal ? formatBytes(step.bytesTotal) : undefined)
  );
}

/**
 * A step's message: the weights step's own words, else the manager's text
 * with the reason in front where it is not already there (a failed pull reads
 * `ImagePullBackOff: Back-off pulling image …`).
 */
export function stepMessage(step: ServedModelStep): string | undefined {
  if (step.name === 'downloadingWeights') {
    return weightsMessage(step);
  }
  const explanation = explanationWithoutReason(step.message, step.reason);
  if (step.reason && step.state !== 'done') {
    return explanation ? `${step.reason}: ${explanation}` : step.reason;
  }
  return explanation ?? step.message;
}

function typicalSecondsOf(step: ServedModelStep): number | undefined {
  if (step.name === 'downloadingWeights') {
    return weightsTypicalSeconds(step.bytesTotal);
  }
  return (MODEL_TYPICAL_SECONDS as Record<string, number>)[step.name];
}

/**
 * The served model's steps for `LifecycleSteps`, in model-manager's order
 * with the portal's titles; a step the portal has no title for keeps its wire
 * name. Empty where the backend reports no steps.
 */
export function modelLifecycleSteps(
  model: Pick<ServedModel, 'steps'>,
): LifecycleStep[] {
  return (model.steps ?? []).map(step => ({
    id: step.name,
    title: MODEL_STEP_TITLES[step.name] ?? step.name,
    state: step.state,
    since: step.since,
    finishedAt: step.finishedAt,
    message: stepMessage(step),
    typicalSeconds: typicalSecondsOf(step),
  }));
}

/**
 * The phase word of the panel's header: `ready`, `failed · <reason>`,
 * `stopping`, else the step under way in the portal's words.
 */
export function modelPhaseLabel(
  model: Pick<ServedModel, 'phase' | 'steps'>,
): string | undefined {
  if (!model.phase) {
    return undefined;
  }
  if (model.phase === 'failed') {
    const failed = model.steps?.find(step => step.state === 'failed');
    return failed?.reason ? `failed · ${failed.reason}` : 'failed';
  }
  if (model.phase === 'ready') {
    return model.phase;
  }
  if (model.phase === 'terminating') {
    // The row's word for the deletion (`ServedReadinessLabel`).
    return 'stopping';
  }
  return (MODEL_STEP_TITLES[model.phase] ?? model.phase).toLowerCase();
}

/**
 * Settled: nothing the next read would move — `ready` or `failed` with every
 * step done or failed. A served model on its way (or `terminating`, on its
 * way out) is unsettled and keeps the inventory polling at 10 s. A model
 * without a phase (Ollama, an older model-manager) is settled as far as this
 * timeline is concerned.
 */
/** The little the polling needs of a served model: its phase and its steps' states. */
export type ServedModelProgress = {
  phase?: string;
  steps?: { name?: string; state?: string }[];
};

export function isServedModelSettled(model: ServedModelProgress): boolean {
  if (!model.phase) {
    return true;
  }
  if (model.phase !== 'ready' && model.phase !== 'failed') {
    return false;
  }
  return (model.steps ?? []).every(
    step => step.state === 'done' || step.state === 'failed',
  );
}

/**
 * react-query's `refetchInterval` for one installation's inventory: 10 s
 * while a served model is unsettled, else the given idle interval.
 */
export function modelsRefetchInterval(
  models: { running?: ServedModelProgress }[] | undefined,
  idleMs: number,
): number {
  return (models ?? []).some(
    model => model.running && !isServedModelSettled(model.running),
  )
    ? MODEL_POLL_ACTIVE_MS
    : idleMs;
}
