import type {
  ModelManagerFitResult,
  ModelManagerLoadAnswer,
} from './modelManager';
import {
  currentStep,
  describeCache,
  describeFit,
  describeFitVerdict,
  describeLoadAnswer,
  describeServedWhere,
  describeSplit,
  loadAnswerNodes,
  nodeCandidates,
  nodeChoices,
  placementChoices,
  parseServeRoute,
  withoutServeRoute,
  tryModelIdOf,
  servedPresetRow,
} from './modelManagerServe';
import type { ServedModel } from './serving';

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

  it('says a model-image preset is served from its image', () => {
    expect(describeCache({ cached: false, cacheSource: 'oci-image' })).toBe(
      'served from the model image',
    );
  });
});

describe('describeFit of a model image', () => {
  it('names no download where the node holds the image', () => {
    const fit = {
      model: 'm',
      fits: true,
      presets: [],
      downloadBytes: 0,
      prePulledNodes: ['a'],
    } as unknown as ModelManagerFitResult;
    expect(describeFit(fit)).not.toMatch(/Download/);
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

  it('never names the one node an unpinned check judged', () => {
    expect(
      describeFitVerdict({ ...fits, instanceType: undefined, node: 'spark' })
        .summary,
    ).toBe('Fits');
    expect(
      describeFitVerdict({ ...fits, instanceType: undefined }).summary,
    ).toBe('Fits');
  });

  it('names the nodes an unpinned copy may land on, or the one it is pinned to', () => {
    const copy = { ...fits, instanceType: undefined, node: 'b' };
    expect(describeFitVerdict(copy, { fittingNodes: ['a', 'b'] }).summary).toBe(
      'Fits on a and b',
    );
    expect(describeFitVerdict(copy, { node: 'a' }).summary).toBe(
      'Fits — will be placed on a',
    );
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
    ).toEqual({
      installation: undefined,
      cluster: undefined,
      pool: undefined,
      preset: undefined,
    });
  });

  it('carries the preset the pool was deployed to serve, and strips it too', () => {
    const params = new URLSearchParams(
      'serve=1&installation=gazelle&cluster=gazelle&pool=gpu-l4&preset=qwen3-8b-fp8',
    );
    expect(parseServeRoute(params)?.preset).toBe('qwen3-8b-fp8');
    expect(withoutServeRoute(params).toString()).toBe('');
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

describe('placementChoices', () => {
  const base = {
    model: 'm',
    fits: true,
    presets: [],
  } as unknown as ModelManagerFitResult;

  it('offers nothing when model-manager recommends no placement', () => {
    expect(placementChoices(base, undefined)).toBeUndefined();
  });

  it('keeps a recommended split choosable while its check is pending', () => {
    const choices = placementChoices(
      { ...base, recommended: 'split' },
      undefined,
    )!;
    expect(choices.find(c => c.id === 'split')).toMatchObject({
      recommended: true,
      disabled: false,
    });
  });

  it('disables a split that does not fit, with its reason', () => {
    const choices = placementChoices(
      { ...base, recommended: 'copies', node: 'gpu1' },
      { ...base, fits: false, reason: 'no fast link' },
    )!;
    expect(choices).toEqual([
      expect.objectContaining({
        id: 'split',
        disabled: true,
        description: 'no fast link',
      }),
      expect.objectContaining({
        id: 'copies',
        label: 'One copy',
        recommended: true,
        disabled: false,
      }),
    ]);
  });

  it('names the node a copy is pinned to', () => {
    const choices = placementChoices(
      { ...base, recommended: 'copies', node: 'gpu1' },
      undefined,
      'gpu2',
    )!;
    expect(choices.find(c => c.id === 'copies')?.label).toBe(
      'One copy on gpu2',
    );
  });
});

describe('the Node field', () => {
  const GIB = 1024 ** 3;
  const node = (name: string, extra: object = {}) =>
    ({
      name,
      ready: true,
      eligible: true,
      gpuCount: 1,
      budgetBytes: 110 * GIB,
      freeBytes: 90 * GIB,
      ...extra,
    }) as any;
  const pinnedOut = node('c', {
    eligible: false,
    modelImageEligible: true,
    eligibilityReason: 'cannot mount the cache claim',
  });
  const worker = node('w', {
    eligible: false,
    gpuCount: 0,
    eligibilityReason: 'outside the node selector',
  });

  it('lists the GPU nodes, not the plain workers', () => {
    expect(
      nodeCandidates([node('a'), pinnedOut, worker], false).map(n => n.name),
    ).toEqual(['a', 'c']);
  });

  it('offers any node first, each node with its budget, and disables the ones the preset cannot land on', () => {
    const choices = nodeChoices(
      [node('a'), node('b'), pinnedOut, node('d', { ready: false })],
      { b: { model: 'm', fits: false, reason: 'needs 120 GiB' } as any },
      { modelImage: false, prePulledNodes: ['a'] },
    );
    expect(choices).toEqual([
      { id: 'any', label: 'Any node that fits', disabled: false },
      {
        id: 'a',
        label: 'a',
        description: '90.0 GiB free of 110 GiB · model image pulled',
        disabled: false,
      },
      { id: 'b', label: 'b', description: 'needs 120 GiB', disabled: true },
      {
        id: 'c',
        label: 'c',
        description: 'not a serving target: cannot mount the cache claim',
        disabled: true,
      },
      { id: 'd', label: 'd', description: 'not ready', disabled: true },
    ]);
  });

  it('offers a node pinned out by the cache claim for a model-image preset', () => {
    const [, c] = nodeChoices([pinnedOut], {}, { modelImage: true });
    expect(c).toMatchObject({ id: 'c', disabled: false });
  });
});

describe('describeSplit', () => {
  it('names the nodes', () => {
    expect(describeSplit(['a', 'b'])).toBe('Split across a and b');
    expect(describeSplit(['a', 'b', 'c'])).toBe('Split across a, b and c');
  });
});

describe('describeFit of a split', () => {
  it('says the requirement is per node', () => {
    const fit = {
      model: 'm',
      fits: true,
      presets: [],
      placement: 'split',
      nodes: ['a', 'b'],
      weightsBytes: 100 * 1024 ** 3,
      overheadBytes: 20 * 1024 ** 3,
      requiredBytes: 70 * 1024 ** 3,
    } as unknown as ModelManagerFitResult;
    expect(describeFit(fit)).toContain(
      'needs 70.0 GiB on each of 2 nodes (100 GiB of weights split 2 ways + 20.0 GiB of serving headroom)',
    );
  });
});

describe('served presets', () => {
  const row = (overrides: Partial<ServedModel>): ServedModel => ({
    id: 'gazelle/kserve/kserve/flash',
    installation: 'gazelle',
    backend: 'kserve',
    name: 'flash',
    preset: 'flash',
    readiness: 'ready',
    node: 'spark-b',
    endpointHosts: [],
    ...overrides,
  });

  it('finds the served row of a preset on its installation and backend', () => {
    const models = [
      row({ installation: 'other' }),
      row({ readiness: 'available', id: 'cached' }),
      row({ id: 'served' }),
    ];
    expect(servedPresetRow(models, 'gazelle', 'kserve', 'flash')?.id).toBe(
      'served',
    );
    expect(
      servedPresetRow(models, 'gazelle', 'kserve', 'other'),
    ).toBeUndefined();
    expect(
      servedPresetRow(
        [row({ readiness: 'available' })],
        'gazelle',
        'kserve',
        'flash',
      ),
    ).toBeUndefined();
  });

  it('says where a served row runs', () => {
    expect(describeServedWhere(row({}))).toBe('Serving on spark-b');
    expect(describeServedWhere(row({ readiness: 'terminating' }))).toBe(
      'Stopping on spark-b',
    );
    expect(
      describeServedWhere(row({ splitNodes: ['spark-a', 'spark-b'] })),
    ).toBe('Serving on spark-a, spark-b');
    expect(describeServedWhere(row({ node: undefined }))).toBe(
      'Serving already',
    );
  });

  it('names the nodes of a load answer: the existing object’s, else the fit’s', () => {
    expect(
      loadAnswerNodes({
        name: 'flash',
        loaded: true,
        alreadyServing: true,
        servingNodes: ['spark-b'],
      } as ModelManagerLoadAnswer),
    ).toEqual(['spark-b']);
    expect(
      loadAnswerNodes({
        name: 'flash',
        loaded: true,
        fit: { node: 'spark-a' },
      } as ModelManagerLoadAnswer),
    ).toEqual(['spark-a']);
    expect(
      loadAnswerNodes({
        name: 'flash',
        loaded: true,
      } as ModelManagerLoadAnswer),
    ).toEqual([]);
  });
});
