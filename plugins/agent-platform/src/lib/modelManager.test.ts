import backendOllama from './__fixtures__/model-manager.backend.ollama.json';
import backendKserve from './__fixtures__/model-manager.backend.kserve.json';
import modelsOllama from './__fixtures__/model-manager.models.ollama.json';
import modelsKserve from './__fixtures__/model-manager.models.kserve.json';
import jobs from './__fixtures__/model-manager.jobs.json';
import {
  isJobActive,
  modelManagerBackendSchema,
  modelManagerJobSchema,
  modelManagerModelSchema,
  parseModelManagerList,
} from './modelManager';

describe('modelManagerBackendSchema', () => {
  it('reads the Ollama backend as the lab reports it', () => {
    const backend = modelManagerBackendSchema.parse(backendOllama);

    expect(backend.backend).toBe('ollama');
    expect(backend.version).toBe('0.33.2');
    expect(backend.endpoint).toBe('http://172.21.0.1:11434');
    expect(backend.healthy).toBe(true);
    expect(backend.capabilities).toMatchObject({
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
    expect(backend.wiring).toEqual({
      namespace: 'kagent',
      apiVersion: 'v1alpha2',
      autoWire: true,
    });
  });

  it('reads a KServe backend with every capability on', () => {
    const backend = modelManagerBackendSchema.parse(backendKserve);

    expect(backend.backend).toBe('kserve');
    expect(backend.capabilities.presets).toBe(true);
    expect(backend.capabilities.nodeInventory).toBe(true);
  });

  it('treats missing flags as false and a missing capabilities block as none', () => {
    const backend = modelManagerBackendSchema.parse({
      backend: 'ollama',
      healthy: 'yes',
      capabilities: { pull: true },
    });

    expect(backend.healthy).toBe(false);
    expect(backend.capabilities.pull).toBe(true);
    expect(backend.capabilities.delete).toBe(false);

    const bare = modelManagerBackendSchema.parse({ backend: 'ollama' });
    expect(Object.values(bare.capabilities).every(flag => flag === false)).toBe(
      true,
    );
  });

  it('rejects a descriptor without a backend name', () => {
    expect(modelManagerBackendSchema.safeParse({ healthy: true }).success).toBe(
      false,
    );
  });
});

describe('modelManagerModelSchema', () => {
  it('reads the Ollama inventory with sizes, features and loaded state', () => {
    const models = parseModelManagerList(
      modelsOllama,
      'models',
      modelManagerModelSchema,
    );

    expect(models.map(model => model.name)).toEqual([
      'qwen3.5:9b',
      'qwen3:0.6b',
      'gemma3:270m',
    ]);
    expect(models[0]).toMatchObject({
      sizeBytes: 6594474711,
      parameterSize: '9.7B',
      quantization: 'Q4_K_M',
      contextLength: 262144,
      capabilities: ['vision', 'completion', 'tools', 'thinking'],
      loaded: false,
    });
    expect(models[2].capabilities).toEqual(['completion']);
    expect(models[0].modelConfig).toBeUndefined();
  });

  it('reads a KServe inventory with running state and the wired ModelConfig', () => {
    const models = parseModelManagerList(
      modelsKserve,
      'models',
      modelManagerModelSchema,
    );

    expect(models[0].loaded).toBe(true);
    expect(models[0].running).toMatchObject({
      endpoint: 'http://qwen3-14b-predictor.model-serving.svc.cluster.local',
      node: 'gpu-node-1',
    });
    expect(models[0].modelConfig).toMatchObject({
      name: 'qwen3-14b',
      namespace: 'kagent',
      ready: true,
    });
    expect(models[1].loaded).toBe(false);
    expect(models[1].running).toBeUndefined();
  });

  it('drops a row without a name and keeps the rest', () => {
    const models = parseModelManagerList(
      { models: [{ sizeBytes: 1 }, { name: 'ok:1b' }, 'garbage'] },
      'models',
      modelManagerModelSchema,
    );

    expect(models.map(model => model.name)).toEqual(['ok:1b']);
  });

  it('degrades a malformed nested object to undefined rather than failing the row', () => {
    const [model] = parseModelManagerList(
      { models: [{ name: 'x', running: 'nope', modelConfig: { name: 1 } }] },
      'models',
      modelManagerModelSchema,
    );

    expect(model.running).toBeUndefined();
    expect(model.modelConfig).toBeUndefined();
  });

  it('answers an empty list for a missing or non-array key', () => {
    expect(
      parseModelManagerList({}, 'models', modelManagerModelSchema),
    ).toEqual([]);
    expect(
      parseModelManagerList({ models: 'x' }, 'models', modelManagerModelSchema),
    ).toEqual([]);
    expect(
      parseModelManagerList(undefined, 'models', modelManagerModelSchema),
    ).toEqual([]);
  });
});

describe('modelManagerJobSchema', () => {
  it('reads finished pull jobs with their wired ModelConfig', () => {
    const parsed = parseModelManagerList(jobs, 'jobs', modelManagerJobSchema);

    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({
      id: '910aff50c27e666b',
      model: 'qwen2.5:0.5b',
      phase: 'succeeded',
      percent: 100,
      wire: true,
    });
    expect(parsed[0].result).toMatchObject({
      name: 'qwen2-5-0-5b',
      namespace: 'kagent',
      provider: 'Ollama',
      ready: false,
    });
    expect(isJobActive(parsed[0])).toBe(false);
  });

  it('treats an unknown phase as still running, so the poll keeps going', () => {
    const job = modelManagerJobSchema.parse({
      id: 'j',
      model: 'm',
      phase: 'verifying',
    });

    expect(job.phase).toBe('running');
    expect(isJobActive(job)).toBe(true);
  });

  it('reads a null result as no ModelConfig', () => {
    const job = modelManagerJobSchema.parse({
      id: 'j',
      model: 'm',
      phase: 'succeeded',
      result: null,
    });

    expect(job.result).toBeUndefined();
  });
});

describe('modelManagerBackendSchema: loading', () => {
  it('reads the loading block', () => {
    const backend = modelManagerBackendSchema.parse({
      ...backendOllama,
      loading: {
        onDemand: true,
        idleEviction: true,
        keepAliveDefault: '5m',
        keepAliveScope: 'request',
      },
    });
    expect(backend.loading).toEqual({
      onDemand: true,
      idleEviction: true,
      keepAliveDefault: '5m',
      keepAliveScope: 'request',
    });
  });

  it('leaves loading undefined when absent or not an object, and degrades bad fields', () => {
    expect(modelManagerBackendSchema.parse(backendOllama).loading).toBe(
      undefined,
    );
    expect(
      modelManagerBackendSchema.parse({ ...backendOllama, loading: 'yes' })
        .loading,
    ).toBeUndefined();
    expect(
      modelManagerBackendSchema.parse({
        ...backendOllama,
        loading: { onDemand: 'true', keepAliveScope: 'weekly' },
      }).loading,
    ).toEqual({
      onDemand: false,
      idleEviction: false,
      keepAliveDefault: undefined,
      keepAliveScope: undefined,
    });
  });
});
