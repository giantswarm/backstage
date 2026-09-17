import type {
  ModelManagerFitResult,
  ModelManagerLoadAnswer,
} from './modelManager';
import {
  currentStep,
  describeCache,
  describeFitVerdict,
  describeLoadAnswer,
  parseServeRoute,
  withoutServeRoute,
  tryModelIdOf,
} from './modelManagerServe';

/** `check_fit` on gazelle's L4 pool for a preset that fits (model-manager 0.24.0). */
const fits: ModelManagerFitResult = {
  model: 'qwen3-4b-instruct',
  fits: true,
  presets: [],
  instanceType: 'g6.xlarge',
  budgetSource: 'pool-scale-from-zero',
  cached: true,
  cacheSource: 'index',
  weightsBytes: 8_060_000_000,
  overheadBytes: 4_000_000_000,
  requiredBytes: 12_060_000_000,
  gated: false,
  private: false,
  tokenConfigured: false,
};

const tooBig: ModelManagerFitResult = {
  model: 'qwen3-8b-fp8',
  fits: false,
  presets: [],
  reason:
    'no size of the pool hosts qwen3-8b-fp8: needs 21.1 GB, the largest size g6.xlarge has 24 GB of which 22 GB are usable',
  budgetSource: 'pool-scale-from-zero',
  cached: false,
  cacheSource: 'unknown',
  requiredBytes: 21_100_000_000,
  gated: false,
  private: false,
  tokenConfigured: false,
};

describe('describeCache', () => {
  it('names the weights cached with how it was decided', () => {
    expect(describeCache(fits)).toBe('weights cached (index)');
  });

  it('calls false a verdict only when a scan or the index answered', () => {
    expect(describeCache({ cached: false, cacheSource: 'scan' })).toBe(
      'weights not cached — downloaded when the node starts',
    );
    expect(describeCache({ cached: false, cacheSource: 'unknown' })).toBe(
      'cache state unknown',
    );
    expect(describeCache({ cached: false })).toBe('cache state unknown');
  });
});

describe('describeFitVerdict', () => {
  it('says the preset fits, the instance type the node comes as, and the cache', () => {
    const verdict = describeFitVerdict(fits);
    expect(verdict.fits).toBe(true);
    expect(verdict.summary).toBe('Fits — the node comes as g6.xlarge');
    expect(verdict.details[0]).toBe('weights cached (index)');
    expect(verdict.details[1]).toMatch(
      /^needs 11\.\d+ GiB \(7\.\d+ GiB of weights/,
    );
  });

  it('falls back to the node when there is no instance type', () => {
    expect(
      describeFitVerdict({ ...fits, instanceType: undefined, node: 'spark' })
        .summary,
    ).toBe('Fits — on spark');
    expect(
      describeFitVerdict({ ...fits, instanceType: undefined }).summary,
    ).toBe('Fits');
  });

  it('gives the reason when no size of the pool hosts the preset', () => {
    const verdict = describeFitVerdict(tooBig);
    expect(verdict.fits).toBe(false);
    expect(verdict.summary).toBe(tooBig.reason);
    expect(verdict.details).toEqual([
      expect.stringMatching(/^needs 19\.\d+ GiB$/),
    ]);
  });
});

describe('describeLoadAnswer', () => {
  const answer: ModelManagerLoadAnswer = {
    name: 'qwen3-4b-instruct',
    backend: 'kserve',
    loaded: false,
    running: {
      resource: 'qwen3-4b-instruct',
      kind: 'LLMInferenceService',
      status: 'Pending',
      reason: 'WaitingForPod',
      phase: 'scheduling',
      steps: [
        {
          name: 'scheduling',
          state: 'inProgress',
          since: '2026-09-17T06:59:00Z',
          reason: 'WaitingForPod',
          message: 'waiting for the predictor pod',
        },
        { name: 'nodeStarting', state: 'pending' },
        { name: 'downloadingWeights', state: 'pending' },
      ],
    },
    fit: fits,
  };

  it('names the object created, the fit it was judged by and the step under way', () => {
    expect(describeLoadAnswer(answer)).toBe(
      'LLMInferenceService qwen3-4b-instruct · Fits — the node comes as g6.xlarge · weights cached (index) · scheduling: waiting for the predictor pod',
    );
  });

  it('falls back to status and reason without steps, and says nothing of what it does not know', () => {
    expect(
      describeLoadAnswer({
        ...answer,
        fit: undefined,
        running: { ...answer.running, steps: undefined },
      }),
    ).toBe('LLMInferenceService qwen3-4b-instruct · Pending · WaitingForPod');
    expect(
      describeLoadAnswer({
        name: 'smollm2:135m',
        backend: 'ollama',
        loaded: true,
      }),
    ).toBe('');
  });

  it('picks the failed step over later pending ones', () => {
    expect(
      currentStep([
        { name: 'scheduling', state: 'done' },
        { name: 'pullingImage', state: 'failed', reason: 'ImagePullBackOff' },
        { name: 'loading', state: 'pending' },
      ])?.name,
    ).toBe('pullingImage');
    expect(currentStep([{ name: 'ready', state: 'done' }])).toBeUndefined();
  });
});

describe('parseServeRoute', () => {
  it('reads the pool link and strips it from the params', () => {
    const params = new URLSearchParams(
      'serve=1&installation=gazelle&cluster=gazelle&pool=gpu-l4&tab=x',
    );
    expect(parseServeRoute(params)).toEqual({
      installation: 'gazelle',
      cluster: 'gazelle',
      pool: 'gpu-l4',
    });
    expect(withoutServeRoute(params).toString()).toBe('tab=x');
  });

  it('is no route without serve=1, and leaves out blank values', () => {
    expect(parseServeRoute(new URLSearchParams('pool=gpu-l4'))).toBeUndefined();
    expect(
      parseServeRoute(new URLSearchParams('serve=1&installation=&pool= ')),
    ).toEqual({ installation: undefined, cluster: undefined, pool: undefined });
  });
});

describe('tryModelIdOf', () => {
  const row = {
    name: 'qwen3-4b-instruct',
    modelSource: 'Qwen/Qwen3-4B-Instruct-2507',
    modelConfig: {
      name: 'qwen3-4b-instruct',
      namespace: 'kagent',
      model: 'Qwen/Qwen3-4B-Instruct-2507',
    },
  };

  it("sends what the ModelConfig sends — spec.model — never the serving object's name", () => {
    expect(tryModelIdOf(row)).toBe('Qwen/Qwen3-4B-Instruct-2507');
    // A ModelConfig that does not say: the model's source reference.
    expect(
      tryModelIdOf({
        ...row,
        modelConfig: { name: 'qwen3-4b-instruct', namespace: 'kagent' },
      }),
    ).toBe('Qwen/Qwen3-4B-Instruct-2507');
    // Nothing better known: the serving object's name, as before.
    expect(tryModelIdOf({ name: 'llama3', modelSource: undefined })).toBe(
      'llama3',
    );
  });
});
