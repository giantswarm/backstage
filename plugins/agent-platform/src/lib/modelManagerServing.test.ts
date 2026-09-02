import backendOllama from './__fixtures__/model-manager.backend.ollama.json';
import backendKserve from './__fixtures__/model-manager.backend.kserve.json';
import modelsOllama from './__fixtures__/model-manager.models.ollama.json';
import modelsKserve from './__fixtures__/model-manager.models.kserve.json';
import nodesKserve from './__fixtures__/model-manager.nodes.kserve.json';
import {
  modelManagerBackendSchema,
  modelManagerModelSchema,
  modelManagerNodeSchema,
  parseModelManagerList,
} from './modelManager';
import {
  describeServedModel,
  formatBytes,
  formatContextLength,
  isServedInferenceService,
  lacksToolCalling,
  managerRefOf,
  namespaceOfPredictorUrl,
  notableCapabilities,
  sharedHostsOf,
  toGpuNodeFromManager,
  toServedModelFromManager,
  toServingBackend,
  toServingCapabilities,
  toServingLoading,
  validateModelRef,
} from './modelManagerServing';
import { findServedModel } from './serving';

const ollama = {
  ...modelManagerBackendSchema.parse(backendOllama),
  backend: 'ollama' as const,
};
const kserve = {
  ...modelManagerBackendSchema.parse(backendKserve),
  backend: 'kserve' as const,
};
const ollamaModels = parseModelManagerList(
  modelsOllama,
  'models',
  modelManagerModelSchema,
);
const kserveModels = parseModelManagerList(
  modelsKserve,
  'models',
  modelManagerModelSchema,
);
const kserveNodes = parseModelManagerList(
  nodesKserve,
  'nodes',
  modelManagerNodeSchema,
);

describe('toServingBackend / toServingCapabilities', () => {
  it('knows ollama and kserve, nothing else', () => {
    expect(toServingBackend('ollama')).toBe('ollama');
    expect(toServingBackend('kserve')).toBe('kserve');
    expect(toServingBackend('vllm-operator')).toBeUndefined();
  });

  it('carries every flag over unchanged', () => {
    expect(toServingCapabilities(ollama.capabilities)).toEqual({
      pull: true,
      pullProgress: true,
      delete: true,
      load: true,
      unload: true,
      loadedModels: true,
      wire: true,
      presets: false,
      fitCheck: false,
      nodeInventory: false,
      search: false,
    });
  });
});

describe('toServedModelFromManager', () => {
  it('maps a downloaded, unloaded Ollama model as available on the host endpoint', () => {
    const served = toServedModelFromManager('lab', ollama, ollamaModels[0]);

    expect(served).toMatchObject({
      id: 'lab/ollama//qwen3.5:9b',
      installation: 'lab',
      backend: 'ollama',
      name: 'qwen3.5:9b',
      modelSource: 'qwen3.5:9b',
      runtime: 'ollama 0.33.2',
      readiness: 'available',
      readinessMessage: 'Downloaded; not loaded in memory.',
      internalUrl: 'http://172.21.0.1:11434',
      endpointHosts: ['172.21.0.1'],
      sizeBytes: 6594474711,
      loaded: false,
      capabilities: ['vision', 'completion', 'tools', 'thinking'],
      details: {
        family: 'qwen35',
        parameterSize: '9.7B',
        quantization: 'Q4_K_M',
        contextLength: 262144,
        format: 'gguf',
      },
    });
    expect(served.node).toBeUndefined();
    expect(served.gpuCount).toBeUndefined();
    expect(served.modelConfig).toBeUndefined();
  });

  it('maps a loaded model as ready with its footprint and expiry', () => {
    const served = toServedModelFromManager('lab', ollama, {
      ...ollamaModels[1],
      loaded: true,
      running: {
        name: 'qwen3:0.6b',
        sizeBytes: 1_200_000_000,
        expiresAt: '2026-09-02T13:05:00Z',
      },
      modelConfig: {
        name: 'qwen3-0-6b',
        namespace: 'kagent',
        managed: true,
        ready: true,
      },
    });

    expect(served.readiness).toBe('ready');
    expect(served.readinessMessage).toMatch(/^Loaded in memory until /);
    expect(served.loaded).toBe(true);
    expect(served.memoryBytes).toBe(1_200_000_000);
    expect(served.loadedUntil).toBe('2026-09-02T13:05:00Z');
    expect(served.modelConfig).toEqual({
      name: 'qwen3-0-6b',
      namespace: 'kagent',
      managed: true,
      ready: true,
      message: undefined,
    });
  });

  it('marks every model not ready while the backend is unhealthy', () => {
    const served = toServedModelFromManager(
      'lab',
      { ...ollama, healthy: false, message: 'dial tcp: connection refused' },
      ollamaModels[0],
    );

    expect(served.readiness).toBe('notReady');
    expect(served.readinessMessage).toBe('dial tcp: connection refused');
  });

  it('maps a served KServe model as its InferenceService, like the CR source does', () => {
    const served = toServedModelFromManager('gpu', kserve, kserveModels[0]);

    expect(served).toMatchObject({
      // Same id and name as the CR read of the same InferenceService, so the
      // two fold into one row and the ModelConfig's spec.model matches.
      id: 'gpu/kserve/model-serving/qwen3-14b',
      backend: 'kserve',
      name: 'qwen3-14b',
      namespace: 'model-serving',
      managerRef: 'Qwen/Qwen3-14B',
      modelSource: 'Qwen/Qwen3-14B',
      readiness: 'ready',
      readinessMessage: 'InferenceService qwen3-14b is ready.',
      node: 'gpu-node-1',
      nodeSource: 'pod',
      gpuCount: 1,
      preset: 'qwen3-14b',
      downloaded: true,
      cachePath: 'qwen3-14b',
      managedByPortal: true,
      internalUrl: 'http://qwen3-14b-predictor.model-serving.svc.cluster.local',
      // The portal's own wiring, which model-manager recognises but does not own.
      modelConfig: {
        name: 'qwen3-14b',
        namespace: 'kagent',
        managed: false,
        ready: true,
      },
      operable: true,
    });
    // Only the predictor answers; the backend "endpoint" is the CR API.
    expect(served.endpointHosts).toEqual([
      'qwen3-14b-predictor.model-serving.svc.cluster.local',
    ]);
    expect(served.runtime).toBeUndefined();
  });

  it('maps a cached KServe model nobody serves as available on its node', () => {
    const served = toServedModelFromManager('gpu', kserve, kserveModels[1]);

    expect(served).toMatchObject({
      id: 'gpu/kserve/cache/gpu-node-1/devstral-small-2',
      name: 'mistralai/Devstral-Small-2-24B-Instruct-2512',
      managerRef: 'mistralai/Devstral-Small-2-24B-Instruct-2512',
      readiness: 'available',
      readinessMessage: 'Downloaded on gpu-node-1; not serving.',
      node: 'gpu-node-1',
      downloaded: true,
      cachePath: 'devstral-small-2',
      preset: 'devstral-small-2',
      loaded: false,
    });
    expect(served.namespace).toBeUndefined();
    expect(served.endpointHosts).toEqual([]);
    expect(isServedInferenceService(served)).toBe(false);
    expect(
      isServedInferenceService(
        toServedModelFromManager('gpu', kserve, kserveModels[0]),
      ),
    ).toBe(true);
  });

  it('follows the InferenceService readiness model-manager reads from the CR', () => {
    const base = kserveModels[0];
    const pending = toServedModelFromManager('gpu', kserve, {
      ...base,
      running: { ...base.running!, status: 'Pending', message: undefined },
    });
    const failing = toServedModelFromManager('gpu', kserve, {
      ...base,
      running: {
        ...base.running!,
        status: 'NotReady',
        message: 'predictor pod is crash-looping',
      },
    });
    const terminating = toServedModelFromManager('gpu', kserve, {
      ...base,
      running: { ...base.running!, status: 'Terminating', message: undefined },
    });

    expect(pending.readiness).toBe('pending');
    expect(pending.readinessMessage).toMatch(/has not reported yet/);
    expect(failing.readiness).toBe('notReady');
    expect(failing.readinessMessage).toBe('predictor pod is crash-looping');
    expect(terminating.readiness).toBe('notReady');
    expect(terminating.readinessMessage).toMatch(/being deleted/);
  });

  it('maps a node of the kserve inventory with its budget and cache', () => {
    const node = toGpuNodeFromManager('gpu', kserveNodes[0]);

    expect(node).toEqual({
      id: 'gpu/gpu-node-1',
      installation: 'gpu',
      name: 'gpu-node-1',
      ready: true,
      product: 'NVIDIA-GB10',
      memoryMiB: 122880,
      labeledCount: 1,
      memoryAllocatableBytes: 92417933312,
      memoryBudgetBytes: 92417933312,
      memoryBudgetSource: 'allocatable',
      memoryReservedBytes: 62277025792,
      memoryFreeBytes: 30140907520,
      cache: {
        claim: 'hf-cache',
        mountPath: '/mnt/models',
        models: 3,
        bytesUsed: 77540453864,
        scannedAt: '2026-09-02T16:19:26.157334389Z',
        shared: false,
        error: undefined,
      },
    });
    expect(
      namespaceOfPredictorUrl('http://x-predictor.serving.svc.cluster.local'),
    ).toBe('serving');
    expect(namespaceOfPredictorUrl('http://172.21.0.1:11434')).toBeUndefined();
    expect(
      managerRefOf({
        backend: 'kserve',
        name: 'Qwen/Qwen3-14B',
        managerRef: 'Qwen/Qwen3-14B',
      } as any),
    ).toBe('Qwen/Qwen3-14B');
    // A served InferenceService goes by its name: model-manager resolves it
    // whatever preset it was composed from, unlike the cached repository.
    expect(
      managerRefOf({
        backend: 'kserve',
        name: 'qwen3-14b',
        namespace: 'model-serving',
        managerRef: 'Qwen/Qwen3-14B',
      } as any),
    ).toBe('qwen3-14b');
    expect(managerRefOf({ backend: 'ollama', name: 'qwen3:0.6b' } as any)).toBe(
      'qwen3:0.6b',
    );
  });

  it('lets a ModelConfig on the shared host resolve to the right model by name', () => {
    // agentlab's static `qwen35-local` ModelConfig: an OpenAI-compatible
    // client on the Ollama host, asking for one specific tag.
    const candidates = ollamaModels.map(model =>
      toServedModelFromManager('lab', ollama, model),
    );

    expect(
      findServedModel(
        { endpoint: 'http://172.21.0.1:11434/v1', model: 'qwen3.5:9b' },
        candidates,
      )?.name,
    ).toBe('qwen3.5:9b');
    expect(
      findServedModel(
        { endpoint: 'http://172.21.0.1:11434/v1', model: 'not-downloaded:1b' },
        candidates,
      ),
    ).toBeUndefined();
  });
});

describe('model features', () => {
  it('warns only when features are known and tools is not among them', () => {
    expect(lacksToolCalling({ capabilities: ['completion'] })).toBe(true);
    expect(lacksToolCalling({ capabilities: ['completion', 'tools'] })).toBe(
      false,
    );
    expect(lacksToolCalling({ capabilities: undefined })).toBe(false);
  });

  it('hides the implied completion feature', () => {
    expect(notableCapabilities(['vision', 'completion', 'tools'])).toEqual([
      'vision',
      'tools',
    ]);
    expect(notableCapabilities(['completion'])).toEqual([]);
  });
});

describe('formatting', () => {
  it('humanises byte sizes with binary prefixes', () => {
    expect(formatBytes(undefined)).toBe('—');
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(522653767)).toBe('498 MiB');
    expect(formatBytes(6594474711)).toBe('6.1 GiB');
    expect(formatBytes(34254796848)).toBe('31.9 GiB');
    expect(formatBytes(120 * 1024 ** 3)).toBe('120 GiB');
  });

  it('shortens context lengths', () => {
    expect(formatContextLength(262144)).toBe('256k');
    expect(formatContextLength(40960)).toBe('40k');
    expect(formatContextLength(512)).toBe('512');
    expect(formatContextLength(undefined)).toBe('—');
  });

  it('describes a model from its details, skipping what is unknown', () => {
    expect(
      describeServedModel({
        parameterSize: '9.7B',
        quantization: 'Q4_K_M',
        contextLength: 262144,
      }),
    ).toBe('9.7B · Q4_K_M · 256k ctx');
    expect(describeServedModel({ parameterSize: '268.10M' })).toBe('268.10M');
    expect(describeServedModel(undefined)).toBe('');
    expect(describeServedModel({})).toBe('');
  });
});

describe('validateModelRef', () => {
  it('accepts registry tags and Hugging Face references', () => {
    expect(validateModelRef('qwen2.5:0.5b')).toBeUndefined();
    expect(validateModelRef(' smollm2:135m ')).toBeUndefined();
    expect(
      validateModelRef('hf.co/bartowski/SmolLM2-135M-Instruct-GGUF:Q8_0'),
    ).toBeUndefined();
    expect(validateModelRef('library/gemma3')).toBeUndefined();
  });

  it('explains what is wrong with a bad one', () => {
    expect(validateModelRef('')).toMatch(/Enter a model reference/);
    expect(validateModelRef('has space')).toMatch(/no spaces/);
    expect(validateModelRef(':tag')).toMatch(/letters, digits/);
    expect(validateModelRef('x'.repeat(256))).toMatch(/at most 255/);
  });
});

// --- Loading semantics ---------------------------------------------------------

describe('toServedModelFromManager with the backend’s loading block', () => {
  const ollamaOnDemand = {
    ...ollama,
    loading: {
      onDemand: true,
      idleEviction: true,
      keepAliveDefault: '5m',
      keepAliveScope: 'request' as const,
    },
  };
  const kserveExplicit = {
    ...kserve,
    loading: { onDemand: false, idleEviction: false },
  };

  it('reads a not-loaded Ollama model as Idle when the backend loads on demand', () => {
    const served = toServedModelFromManager(
      'lab',
      ollamaOnDemand,
      ollamaModels[0],
    );

    expect(served.readiness).toBe('idle');
    expect(served.readinessMessage).toBe(
      "Downloaded; not loaded. Ollama loads it on the first request, so an agent's first turn pays the cold start, and it is evicted again after idling.",
    );
  });

  it('keeps today’s Available without a loading block — an older model-manager', () => {
    const served = toServedModelFromManager('lab', ollama, ollamaModels[0]);

    expect(served.readiness).toBe('available');
    expect(served.readinessMessage).toBe('Downloaded; not loaded in memory.');
  });

  it('reads a cached KServe model a model config points at as Not serving when the backend does not load on demand', () => {
    const cached = modelManagerModelSchema.parse({
      name: 'org/tiny',
      downloaded: true,
      loaded: false,
      node: 'gpu-node-1',
      path: 'tiny',
      modelConfig: {
        name: 'tiny',
        namespace: 'kagent',
        managed: false,
        ready: true,
      },
    });

    const pointedAt = toServedModelFromManager('gpu', kserveExplicit, cached);
    expect(pointedAt.readiness).toBe('notServing');
    expect(pointedAt.readinessMessage).toBe(
      'Downloaded on gpu-node-1; not serving, and model config kagent/tiny points at it — agents on it fail until it is served.',
    );

    // Nothing points at it: inventory, not a fault.
    const inventory = toServedModelFromManager('gpu', kserveExplicit, {
      ...cached,
      modelConfig: undefined,
    });
    expect(inventory.readiness).toBe('available');
    expect(inventory.readinessMessage).toBe(
      'Downloaded on gpu-node-1; not serving.',
    );

    // And without the block, the old wording even with a client.
    expect(toServedModelFromManager('gpu', kserve, cached).readiness).toBe(
      'available',
    );
  });

  it('still reads a loaded model as ready, whatever the loading block says', () => {
    const served = toServedModelFromManager('lab', ollamaOnDemand, {
      ...ollamaModels[0],
      loaded: true,
      running: { name: ollamaModels[0].name, sizeBytes: 1 },
    });
    expect(served.readiness).toBe('ready');
  });
});

describe('toServingLoading / sharedHostsOf', () => {
  it('carries the block over and leaves an absent one absent', () => {
    expect(toServingLoading(undefined)).toBeUndefined();
    expect(
      toServingLoading({
        onDemand: true,
        idleEviction: true,
        keepAliveDefault: '5m',
        keepAliveScope: 'request',
      }),
    ).toEqual({
      onDemand: true,
      idleEviction: true,
      keepAliveDefault: '5m',
      keepAliveScope: 'request',
    });
  });

  it('names Ollama’s host as shared by every model, and none for KServe', () => {
    expect(sharedHostsOf(ollama)).toEqual(['172.21.0.1:11434']);
    expect(sharedHostsOf(kserve)).toEqual([]);
    expect(sharedHostsOf({ ...ollama, endpoint: undefined })).toEqual([]);
  });
});
