import { stepTiming } from './lifecycle';
import {
  isServedModelSettled,
  MODEL_POLL_ACTIVE_MS,
  modelLifecycleSteps,
  modelPhaseLabel,
  modelsRefetchInterval,
  weightsMessage,
  weightsTypicalSeconds,
} from './modelLifecycle';
import { formatBytes } from './modelManagerServing';
import type { ServedModelStep } from './serving';

const T0 = '2026-09-17T06:59:00Z';
const T1 = '2026-09-17T06:59:35Z';
const T2 = '2026-09-17T07:03:02Z';
const T3 = '2026-09-17T07:03:22Z';

/** model-manager 0.24.0's steps while the weights download (proof 1's timeline). */
function downloading(): ServedModelStep[] {
  return [
    { name: 'scheduling', state: 'done', since: T0, finishedAt: T1 },
    { name: 'nodeStarting', state: 'done', since: T1, finishedAt: T2 },
    {
      name: 'downloadingWeights',
      state: 'inProgress',
      since: T3,
      reason: 'DownloadingWeights',
      message:
        'storage-initializer downloading the weights into the cache claim: 3.1 GB of 8.1 GB',
      bytesCompleted: 3_100_000_000,
      bytesTotal: 8_060_000_000,
    },
    { name: 'pullingImage', state: 'pending' },
    { name: 'loading', state: 'pending' },
    { name: 'routing', state: 'pending' },
    { name: 'ready', state: 'pending' },
  ];
}

describe('modelLifecycleSteps', () => {
  it('renders the seven steps in order with the portal titles, states and timings', () => {
    const steps = modelLifecycleSteps({ steps: downloading() });
    expect(steps.map(step => step.id)).toEqual([
      'scheduling',
      'nodeStarting',
      'downloadingWeights',
      'pullingImage',
      'loading',
      'routing',
      'ready',
    ]);
    expect(steps.map(step => step.title)).toEqual([
      'Predictor pod scheduled',
      'GPU node started',
      'Weights in the cache',
      'Runtime image pulled',
      'Model loaded by vLLM',
      'Route ready',
      'Endpoint answers',
    ]);
    expect(steps.map(step => step.state)).toEqual([
      'done',
      'done',
      'inProgress',
      'pending',
      'pending',
      'pending',
      'pending',
    ]);
    const now = Date.parse(T3) + 30_000;
    expect(stepTiming(steps[0], now)).toBe('took 35 s');
    expect(stepTiming(steps[1], now)).toBe('took 3 min 27 s');
    expect(stepTiming(steps[2], now)).toBe(
      'started 30 s ago · typ. 1 min 13 s',
    );
    expect(stepTiming(steps[3], now)).toBe('typ. 4 min');
  });

  it('shows bytes on the weights step while downloading, then cached or the size once done', () => {
    const steps = downloading();
    expect(weightsMessage(steps[2])).toBe(
      `${formatBytes(3_100_000_000)} of ${formatBytes(8_060_000_000)}`,
    );
    expect(
      weightsMessage({
        name: 'downloadingWeights',
        state: 'done',
        since: T3,
        finishedAt: T3,
        bytesTotal: 8_060_000_000,
        cached: true,
      }),
    ).toBe('cached — the claim already held the weights');
    expect(
      weightsMessage({
        name: 'downloadingWeights',
        state: 'done',
        bytesTotal: 8_060_000_000,
        cached: false,
      }),
    ).toBe(`${formatBytes(8_060_000_000)} downloaded`);
    // Without the cache agent there is no progress: model-manager's own text.
    expect(
      weightsMessage({
        name: 'downloadingWeights',
        state: 'inProgress',
        message:
          'storage-initializer downloading the weights into the cache claim',
        bytesTotal: 8_060_000_000,
      }),
    ).toBe('storage-initializer downloading the weights into the cache claim');
  });

  it('scales the typical download time with the weights: 72 s per 8 GB', () => {
    expect(weightsTypicalSeconds(8_000_000_000)).toBe(72);
    expect(weightsTypicalSeconds(16_000_000_000)).toBe(144);
    expect(weightsTypicalSeconds(undefined)).toBe(72);
  });

  it('a failed step carries the reason and the manager’s text, never a bare pending', () => {
    const [failed] = modelLifecycleSteps({
      steps: [
        {
          name: 'pullingImage',
          state: 'failed',
          since: T3,
          reason: 'ImagePullBackOff',
          message: 'Back-off pulling image "ghcr.io/llm-d/llm-d-cuda:v0.4.0"',
        },
      ],
    });
    expect(failed.state).toBe('failed');
    expect(failed.message).toBe(
      'ImagePullBackOff: Back-off pulling image "ghcr.io/llm-d/llm-d-cuda:v0.4.0"',
    );
    // model-manager's `message` already starts with the reason: not doubled.
    const [scheduling] = modelLifecycleSteps({
      steps: [
        {
          name: 'scheduling',
          state: 'inProgress',
          reason: 'Unschedulable',
          message:
            'Unschedulable 0/12 nodes are available: 12 Insufficient nvidia.com/gpu.',
        },
      ],
    });
    expect(scheduling.message).toBe(
      'Unschedulable: 0/12 nodes are available: 12 Insufficient nvidia.com/gpu.',
    );
  });

  it('is empty where the backend reports no steps', () => {
    expect(modelLifecycleSteps({})).toEqual([]);
  });
});

describe('modelPhaseLabel', () => {
  it('names the step under way, ready, terminating, or the failure’s reason', () => {
    expect(modelPhaseLabel({ phase: 'downloadingWeights' })).toBe(
      'weights in the cache',
    );
    expect(modelPhaseLabel({ phase: 'ready' })).toBe('ready');
    expect(modelPhaseLabel({ phase: 'terminating' })).toBe('stopping');
    expect(
      modelPhaseLabel({
        phase: 'failed',
        steps: [
          { name: 'loading', state: 'failed', reason: 'CrashLoopBackOff' },
        ],
      }),
    ).toBe('failed · CrashLoopBackOff');
    expect(modelPhaseLabel({})).toBeUndefined();
  });
});

describe('polling', () => {
  it('polls at 10 s while a served model is on its way or terminating, idle otherwise', () => {
    expect(isServedModelSettled({ phase: 'downloadingWeights' })).toBe(false);
    expect(isServedModelSettled({ phase: 'terminating' })).toBe(false);
    expect(
      isServedModelSettled({
        phase: 'ready',
        steps: [{ name: 'ready', state: 'done' }],
      }),
    ).toBe(true);
    expect(
      isServedModelSettled({
        phase: 'failed',
        steps: [{ name: 'pullingImage', state: 'failed' }],
      }),
    ).toBe(true);
    // No phase (Ollama, an older model-manager): nothing to follow.
    expect(isServedModelSettled({})).toBe(true);

    expect(
      modelsRefetchInterval(
        [{ running: { phase: 'loading' } }, { running: { phase: 'ready' } }],
        30_000,
      ),
    ).toBe(MODEL_POLL_ACTIVE_MS);
    expect(
      modelsRefetchInterval([{ running: { phase: 'ready' } }, {}], 30_000),
    ).toBe(30_000);
    expect(modelsRefetchInterval(undefined, 30_000)).toBe(30_000);
  });
});
