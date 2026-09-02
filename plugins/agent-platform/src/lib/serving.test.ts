import {
  findServedModelForEndpoint,
  gpuFree,
  gpuTotal,
  mergeServingSnapshots,
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

  it('is empty and settled with no sources', () => {
    expect(mergeServingSnapshots([])).toEqual({
      isLoading: false,
      installations: [],
      backends: {},
      unreachableInstallations: [],
      servedModels: [],
      gpuNodes: [],
      gpuCapacityUnavailable: {},
    });
  });
});
