import type { ModelManagerFitResult } from './modelManager';
import {
  describeServeChoice,
  newServeIntent,
  parseServeIntents,
  poolIdOf,
  refusedOutcome,
  SERVE_INTENT_STALE_MS,
  servedModelOf,
  serveIntentStep,
  staleServeIntentIds,
  type ServeIntent,
} from './serveIntent';
import type { ServedModel } from './serving';

const POOL = { installation: 'inst-1', cluster: 'wc1', poolName: 'gpu-l4' };
const CHOICE = {
  preset: 'qwen3-8b-fp8',
  displayName: 'Qwen3 8B FP8',
  model: 'Qwen/Qwen3-8B-FP8',
};
const T0 = '2026-09-17T12:00:00.000Z';
const T1 = '2026-09-17T12:05:00.000Z';
const T2 = '2026-09-17T12:12:00.000Z';

function intent(overrides: Partial<ServeIntent> = {}): ServeIntent {
  return { ...newServeIntent(POOL, CHOICE, T0), ...overrides };
}

function served(overrides: Partial<ServedModel> = {}): ServedModel {
  return {
    id: 'inst-1/kserve/model-serving/qwen3-8b-fp8',
    installation: 'inst-1',
    backend: 'kserve',
    name: 'qwen3-8b-fp8',
    preset: 'qwen3-8b-fp8',
    readiness: 'pending',
    endpointHosts: [],
    loaded: true,
    phase: 'nodeStarting',
    steps: [
      { name: 'scheduling', state: 'done', since: T1, finishedAt: T1 },
      { name: 'nodeStarting', state: 'inProgress', since: T1 },
      { name: 'downloadingWeights', state: 'pending' },
      { name: 'ready', state: 'pending' },
    ],
    ...overrides,
  };
}

const READY = served({
  readiness: 'ready',
  phase: 'ready',
  externalUrl: 'https://models.example/model-serving/qwen3-8b-fp8',
  steps: [
    { name: 'scheduling', state: 'done', since: T1, finishedAt: T1 },
    { name: 'nodeStarting', state: 'done', since: T1, finishedAt: T2 },
    { name: 'ready', state: 'done', since: T2, finishedAt: T2 },
  ],
});

describe('poolIdOf and newServeIntent', () => {
  it('files the intent under the row id of the pool', () => {
    expect(poolIdOf(POOL)).toBe('inst-1/wc1/wc1-gpu-l4');
    expect(intent()).toEqual({
      installation: 'inst-1',
      cluster: 'wc1',
      poolName: 'gpu-l4',
      preset: 'qwen3-8b-fp8',
      displayName: 'Qwen3 8B FP8',
      model: 'Qwen/Qwen3-8B-FP8',
      chosenAt: T0,
    });
    expect(describeServeChoice(CHOICE)).toBe(
      'Qwen3 8B FP8 (Qwen/Qwen3-8B-FP8)',
    );
    expect(describeServeChoice({ preset: 'qwen3-8b-fp8' })).toBe(
      'qwen3-8b-fp8',
    );
  });
});

describe('parseServeIntents', () => {
  it('reads what is an intent, drops what is not, and keys by pool id', () => {
    const stored = {
      'some/old/key': intent(),
      broken: { installation: 'inst-1', preset: 'x' },
      text: 'nope',
      'inst-1/wc1/wc1-gpu-b': {
        ...intent({ poolName: 'gpu-b' }),
        outcome: { kind: 'refused', reason: 'too big', at: T1 },
      },
      'inst-1/wc1/wc1-gpu-c': {
        ...intent({ poolName: 'gpu-c' }),
        outcome: { kind: 'served', at: T1 },
      },
    };
    const parsed = parseServeIntents(stored);
    expect(Object.keys(parsed).sort()).toEqual([
      'inst-1/wc1/wc1-gpu-b',
      'inst-1/wc1/wc1-gpu-c',
      'inst-1/wc1/wc1-gpu-l4',
    ]);
    expect(parsed['inst-1/wc1/wc1-gpu-b'].outcome).toEqual({
      kind: 'refused',
      reason: 'too big',
      details: [],
      at: T1,
    });
    // A served outcome without its resource is no outcome: the load is asked again.
    expect(parsed['inst-1/wc1/wc1-gpu-c'].outcome).toBeUndefined();
  });

  it('answers nothing for garbage', () => {
    expect(parseServeIntents(undefined)).toEqual({});
    expect(parseServeIntents('x')).toEqual({});
    expect(parseServeIntents([1, 2])).toEqual({});
  });
});

describe('servedModelOf', () => {
  it('finds the model served from the preset on the installation’s kserve backend', () => {
    const other = served({
      id: 'inst-2/...',
      installation: 'inst-2',
    });
    const cached = served({
      id: 'inst-1/kserve/cache/node-a/qwen3-8b-fp8',
      name: 'Qwen/Qwen3-8B-FP8',
      loaded: false,
      phase: undefined,
      steps: undefined,
      readiness: 'available',
    });
    const ollama = served({ backend: 'ollama', id: 'inst-1/ollama//x' });
    const onItsWay = served();
    expect(servedModelOf(intent(), [other, cached, ollama, onItsWay])).toBe(
      onItsWay,
    );
  });

  it('finds the object load_model composed even when the row names another preset', () => {
    const composed = served({ preset: undefined, name: 'qwen3-8b-fp8-2' });
    const withOutcome = intent({
      outcome: { kind: 'served', resource: 'qwen3-8b-fp8-2', at: T1 },
    });
    expect(servedModelOf(withOutcome, [composed])).toBe(composed);
    expect(servedModelOf(intent(), [composed])).toBeUndefined();
  });
});

describe('refusedOutcome', () => {
  it('keeps check_fit’s reason verbatim with the sizes under it', () => {
    const fit: ModelManagerFitResult = {
      model: 'qwen3-8b-fp8',
      fits: false,
      reason: 'no size of the pool hosts qwen3-8b-fp8: needs 21.1 GB',
      requiredBytes: 21_100_000_000,
      presets: [],
      gated: false,
      private: false,
      tokenConfigured: false,
      cached: false,
    };
    expect(refusedOutcome(fit, T1)).toEqual({
      kind: 'refused',
      reason: 'no size of the pool hosts qwen3-8b-fp8: needs 21.1 GB',
      details: ['needs 19.7 GiB'],
      at: T1,
    });
  });
});

describe('staleServeIntentIds', () => {
  const now = Date.parse(T0) + SERVE_INTENT_STALE_MS + 1;
  const intents = { [poolIdOf(POOL)]: intent() };

  it('names an old intent whose pool a settled list no longer carries', () => {
    expect(
      staleServeIntentIds(
        intents,
        { rowIds: new Set(), settledInstallations: ['inst-1'] },
        now,
      ),
    ).toEqual(['inst-1/wc1/wc1-gpu-l4']);
  });

  it('keeps a listed pool’s, a fresh one’s and one whose installation was not read', () => {
    expect(
      staleServeIntentIds(
        intents,
        {
          rowIds: new Set(['inst-1/wc1/wc1-gpu-l4']),
          settledInstallations: ['inst-1'],
        },
        now,
      ),
    ).toEqual([]);
    expect(
      staleServeIntentIds(
        intents,
        { rowIds: new Set(), settledInstallations: ['inst-1'] },
        Date.parse(T0) + 60_000,
      ),
    ).toEqual([]);
    expect(
      staleServeIntentIds(
        intents,
        { rowIds: new Set(), settledInstallations: ['inst-2'] },
        now,
      ),
    ).toEqual([]);
  });
});

describe('serveIntentStep', () => {
  const href = '/serving?serve=1&pool=gpu-l4';
  const base = {
    intent: intent(),
    stackReady: false,
    loading: false,
    model: undefined,
    serveAnotherHref: href,
  };

  it('waits for the pool’s steps, then starts, then asks model-manager', () => {
    expect(serveIntentStep(base)).toMatchObject({
      id: 'serve',
      title: 'Serving Qwen3 8B FP8',
      state: 'pending',
      message: expect.stringContaining('Qwen3 8B FP8 (Qwen/Qwen3-8B-FP8)'),
    });
    expect(serveIntentStep({ ...base, stackReady: true })).toMatchObject({
      state: 'inProgress',
      message: 'the serving stack is ready — starting',
    });
    expect(
      serveIntentStep({ ...base, stackReady: true, loading: true }),
    ).toMatchObject({
      state: 'inProgress',
      message:
        'asking model-manager as you: check_fit, then load_model {backend: kserve, model: qwen3-8b-fp8}',
    });
  });

  it('shows check_fit’s refusal verbatim, as the dialog words it, with the way out', () => {
    const step = serveIntentStep({
      ...base,
      stackReady: true,
      intent: intent({
        outcome: {
          kind: 'refused',
          reason: 'no size of the pool hosts qwen3-8b-fp8',
          details: ['needs 21.1 GB'],
          at: T1,
        },
      }),
    });
    expect(step).toMatchObject({
      state: 'failed',
      since: T1,
      message:
        'Cannot be served on this pool: no size of the pool hosts qwen3-8b-fp8 · needs 21.1 GB',
      action: { label: 'Serve another model', to: href },
    });
  });

  it('shows what load_model threw, with the dialog on the preset as the way out', () => {
    expect(
      serveIntentStep({
        ...base,
        serveInDialogHref: `${href}&preset=qwen3-8b-fp8`,
        intent: intent({
          outcome: { kind: 'failed', message: 'backend_error: down', at: T1 },
        }),
      }),
    ).toMatchObject({
      state: 'failed',
      message: 'model-manager refused: backend_error: down',
      action: {
        label: 'Serve Qwen3 8B FP8 in the dialog',
        to: `${href}&preset=qwen3-8b-fp8`,
      },
    });
  });

  it('awaits the first inventory read after the load, then follows the served model’s timeline', () => {
    const servedIntent = intent({
      outcome: { kind: 'served', resource: 'qwen3-8b-fp8', at: T1 },
    });
    expect(serveIntentStep({ ...base, intent: servedIntent })).toMatchObject({
      state: 'inProgress',
      since: T1,
      message: expect.stringContaining('model-manager composed qwen3-8b-fp8'),
    });
    const onItsWay = serveIntentStep({
      ...base,
      intent: servedIntent,
      model: served(),
    });
    expect(onItsWay).toMatchObject({
      state: 'inProgress',
      since: T1,
      message: 'qwen3-8b-fp8 · gpu node started',
    });
    expect(onItsWay.steps?.map(step => [step.id, step.state])).toEqual([
      ['scheduling', 'done'],
      ['nodeStarting', 'inProgress'],
      ['downloadingWeights', 'pending'],
      ['ready', 'pending'],
    ]);
    expect(onItsWay.action).toBeUndefined();
  });

  it('is done once the model answers, and stays done after it was stopped', () => {
    const ready = serveIntentStep({
      ...base,
      intent: intent({
        outcome: { kind: 'served', resource: 'qwen3-8b-fp8', at: T1 },
      }),
      model: READY,
    });
    expect(ready).toMatchObject({
      state: 'done',
      since: T1,
      finishedAt: T2,
      message:
        'qwen3-8b-fp8 answers at https://models.example/model-serving/qwen3-8b-fp8',
      action: { label: 'Serve another model', to: href },
    });
    expect(ready.steps).toHaveLength(3);

    const stopped = serveIntentStep({
      ...base,
      intent: intent({
        outcome: {
          kind: 'served',
          resource: 'qwen3-8b-fp8',
          at: T1,
          ready: T2,
        },
      }),
    });
    expect(stopped).toMatchObject({
      state: 'done',
      finishedAt: T2,
      message: expect.stringContaining('was served, then stopped'),
    });
  });

  it('a served model of the preset marks the step even before any load of this browser', () => {
    expect(serveIntentStep({ ...base, model: READY })).toMatchObject({
      state: 'done',
    });
    expect(
      serveIntentStep({
        ...base,
        model: served({
          phase: 'failed',
          readiness: 'notReady',
          steps: [
            {
              name: 'pullingImage',
              state: 'failed',
              reason: 'ImagePullBackOff',
              since: T1,
            },
          ],
        }),
      }),
    ).toMatchObject({
      state: 'failed',
      message: 'qwen3-8b-fp8: failed · ImagePullBackOff',
    });
  });
});
