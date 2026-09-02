import {
  findServedModel,
  findServedModelForEndpoint,
  gpuFree,
  gpuTotal,
  hasServedModelActions,
  mergeServingSnapshots,
  NO_SERVING_CAPABILITIES,
  type GpuNode,
  type ServedModel,
  type ServingSourceSnapshot,
} from './serving';

const qwen: ServedModel = {
  id: 'alpha/kserve/kserve/qwen3-14b',
  installation: 'alpha',
  backend: 'kserve',
  name: 'qwen3-14b',
  namespace: 'kserve',
  readiness: 'ready',
  endpointHosts: [
    'qwen3-14b-predictor.kserve.svc.cluster.local',
    'qwen3-14b-predictor.kserve.svc',
    'qwen3-14b-predictor.kserve',
    'qwen3-14b.models.example.test',
  ],
};

describe('findServedModelForEndpoint', () => {
  it('matches a base URL by hostname regardless of scheme, port and path', () => {
    expect(
      findServedModelForEndpoint(
        'http://qwen3-14b-predictor.kserve.svc.cluster.local/v1',
        [qwen],
      ),
    ).toBe(qwen);
    expect(
      findServedModelForEndpoint(
        'HTTPS://Qwen3-14b.models.example.test:443/v1/',
        [qwen],
      ),
    ).toBe(qwen);
  });

  it('matches nothing for provider defaults, non-URLs and unknown hosts', () => {
    expect(findServedModelForEndpoint(undefined, [qwen])).toBeUndefined();
    expect(findServedModelForEndpoint('', [qwen])).toBeUndefined();
    expect(findServedModelForEndpoint('not-a-url', [qwen])).toBeUndefined();
    expect(
      findServedModelForEndpoint('https://api.openai.com/v1', [qwen]),
    ).toBeUndefined();
  });
});

describe('findServedModel', () => {
  // Two Ollama models on one host: the endpoint alone cannot tell them apart.
  const ollamaHost = ['172.21.0.1'];
  const qwenSmall: ServedModel = {
    id: 'lab/ollama//qwen3:0.6b',
    installation: 'lab',
    backend: 'ollama',
    name: 'qwen3:0.6b',
    readiness: 'available',
    endpointHosts: ollamaHost,
    modelConfig: { name: 'qwen3-0-6b', namespace: 'kagent' },
  };
  const qwenBig: ServedModel = {
    id: 'lab/ollama//qwen3.5:9b',
    installation: 'lab',
    backend: 'ollama',
    name: 'qwen3.5:9b',
    readiness: 'ready',
    endpointHosts: ollamaHost,
  };

  it('prefers the ModelConfig the backend itself created', () => {
    expect(
      findServedModel(
        {
          // A ModelConfig model-manager wired: its host and model may say
          // anything, the reference is exact.
          endpoint: 'http://somewhere-else:11434',
          model: 'renamed',
          modelConfig: { name: 'qwen3-0-6b', namespace: 'kagent' },
        },
        [qwenBig, qwenSmall],
      ),
    ).toBe(qwenSmall);
  });

  it('disambiguates a shared host by the model id', () => {
    expect(
      findServedModel(
        { endpoint: 'http://172.21.0.1:11434/v1', model: 'qwen3.5:9b' },
        [qwenSmall, qwenBig],
      ),
    ).toBe(qwenBig);
    expect(
      findServedModel(
        { endpoint: 'http://172.21.0.1:11434', model: 'qwen3:0.6b' },
        [qwenSmall, qwenBig],
      ),
    ).toBe(qwenSmall);
  });

  it('matches nothing on a shared host when no served model carries the asked-for name', () => {
    expect(
      findServedModel(
        { endpoint: 'http://172.21.0.1:11434/v1', model: 'gemma3:270m' },
        [qwenSmall, qwenBig],
      ),
    ).toBeUndefined();
    expect(
      findServedModel({ endpoint: 'http://172.21.0.1:11434/v1' }, [
        qwenSmall,
        qwenBig,
      ]),
    ).toBeUndefined();
  });

  it('accepts the single model on a host whatever the client calls it', () => {
    // A vLLM InferenceService: the served-model name is the InferenceService,
    // the ModelConfig's model id is whatever vLLM was told to answer as.
    expect(
      findServedModel(
        {
          endpoint: 'http://qwen3-14b-predictor.kserve.svc.cluster.local/v1',
          model: 'qwen3-8-27b',
        },
        [qwen],
      ),
    ).toBe(qwen);
  });

  it('matches nothing for provider defaults and non-URLs', () => {
    expect(findServedModel({}, [qwen])).toBeUndefined();
    expect(findServedModel({ endpoint: '' }, [qwen])).toBeUndefined();
    expect(findServedModel({ model: 'qwen3-14b' }, [qwen])).toBeUndefined();
  });
});

describe('hasServedModelActions', () => {
  it('is true only when an operation beyond listing is offered', () => {
    expect(hasServedModelActions(undefined)).toBe(false);
    expect(hasServedModelActions(NO_SERVING_CAPABILITIES)).toBe(false);
    expect(
      hasServedModelActions({
        ...NO_SERVING_CAPABILITIES,
        nodeInventory: true,
      }),
    ).toBe(false);
    expect(
      hasServedModelActions({ ...NO_SERVING_CAPABILITIES, load: true }),
    ).toBe(true);
    expect(
      hasServedModelActions({ ...NO_SERVING_CAPABILITIES, delete: true }),
    ).toBe(true);
  });
});

describe('gpuTotal / gpuFree', () => {
  const base: GpuNode = {
    id: 'alpha/gpu-node-1',
    installation: 'alpha',
    name: 'gpu-node-1',
    ready: true,
  };

  it('prefers device-plugin capacity over the discovery label', () => {
    expect(gpuTotal({ ...base, capacity: 2, labeledCount: 1 })).toBe(2);
    expect(gpuTotal({ ...base, labeledCount: 1 })).toBe(1);
    expect(gpuTotal(base)).toBeUndefined();
  });

  it('subtracts requests from allocatable, never below zero', () => {
    expect(gpuFree({ ...base, allocatable: 2, requested: 1 })).toBe(1);
    expect(gpuFree({ ...base, allocatable: 1, requested: 3 })).toBe(0);
  });

  it('is unknown without device-plugin data or without pod data', () => {
    expect(gpuFree({ ...base, labeledCount: 1, requested: 0 })).toBeUndefined();
    expect(gpuFree({ ...base, allocatable: 1 })).toBeUndefined();
  });
});

describe('mergeServingSnapshots', () => {
  const kserve: ServingSourceSnapshot = {
    isLoading: false,
    installations: ['alpha'],
    backends: { alpha: 'kserve' },
    unreachableInstallations: ['gaggle'],
    servedModels: [qwen],
    gpuNodes: [
      {
        id: 'alpha/gpu-node-1',
        installation: 'alpha',
        name: 'gpu-node-1',
        ready: true,
      },
    ],
    gpuCapacityUnavailable: { beta: 'forbidden' },
  };
  const ollama: ServingSourceSnapshot = {
    isLoading: true,
    installations: ['lab'],
    backends: { lab: 'ollama' },
    unreachableInstallations: ['gaggle'],
    servedModels: [],
    gpuNodes: [],
    gpuCapacityUnavailable: {},
  };

  it('unions installations, models and nodes, and de-duplicates unreachable', () => {
    const merged = mergeServingSnapshots([kserve, ollama]);

    expect(merged.installations).toEqual(['alpha', 'lab']);
    expect(merged.backends).toEqual({ alpha: 'kserve', lab: 'ollama' });
    expect(merged.unreachableInstallations).toEqual(['gaggle']);
    expect(merged.servedModels).toEqual([qwen]);
    expect(merged.gpuNodes).toHaveLength(1);
    expect(merged.gpuCapacityUnavailable).toEqual({ beta: 'forbidden' });
    expect(merged.isLoading).toBe(true);
  });

  it('lets a later source override an installation an earlier one claimed', () => {
    const merged = mergeServingSnapshots([
      kserve,
      { ...ollama, installations: ['alpha'], backends: { alpha: 'ollama' } },
    ]);

    expect(merged.backends).toEqual({ alpha: 'ollama' });
  });

  it('ORs the capabilities of sources sharing an installation', () => {
    const merged = mergeServingSnapshots([
      {
        ...kserve,
        capabilities: {
          alpha: { ...NO_SERVING_CAPABILITIES, nodeInventory: true },
        },
      },
      {
        ...ollama,
        installations: ['alpha'],
        backends: { alpha: 'ollama' },
        capabilities: {
          alpha: { ...NO_SERVING_CAPABILITIES, pull: true, load: true },
        },
      },
    ]);

    expect(merged.capabilities).toEqual({
      alpha: {
        ...NO_SERVING_CAPABILITIES,
        nodeInventory: true,
        pull: true,
        load: true,
      },
    });
  });

  it('tolerates sources without capabilities', () => {
    expect(mergeServingSnapshots([kserve, ollama]).capabilities).toEqual({});
  });

  it('is empty and settled with no sources', () => {
    expect(mergeServingSnapshots([])).toEqual({
      isLoading: false,
      installations: [],
      backends: {},
      capabilities: {},
      unreachableInstallations: [],
      servedModels: [],
      gpuNodes: [],
      gpuCapacityUnavailable: {},
    });
  });
});
