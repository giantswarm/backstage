import backendOllama from './__fixtures__/model-manager.backend.ollama.json';
import backendKserve from './__fixtures__/model-manager.backend.kserve.json';
import modelsOllama from './__fixtures__/model-manager.models.ollama.json';
import modelsKserve from './__fixtures__/model-manager.models.kserve.json';
import {
  modelManagerBackendSchema,
  modelManagerModelSchema,
  parseModelManagerList,
} from './modelManager';
import {
  describeServedModel,
  formatBytes,
  formatContextLength,
  lacksToolCalling,
  notableCapabilities,
  toServedModelFromManager,
  toServingBackend,
  toServingCapabilities,
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

  it('maps a KServe-backed model with its node and predictor endpoint', () => {
    const served = toServedModelFromManager('gpu', kserve, kserveModels[0]);

    expect(served).toMatchObject({
      backend: 'kserve',
      runtime: 'kserve v0.20.0',
      readiness: 'ready',
      node: 'gpu-node-1',
      internalUrl: 'http://qwen3-14b-predictor.model-serving.svc.cluster.local',
      modelConfig: { name: 'qwen3-14b', namespace: 'kagent', ready: true },
    });
    // Both the predictor's host and the backend's own are answered on.
    expect(served.endpointHosts).toEqual([
      'kubernetes.default.svc',
      'qwen3-14b-predictor.model-serving.svc.cluster.local',
    ]);
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
