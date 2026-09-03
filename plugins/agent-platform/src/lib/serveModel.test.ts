import type { GpuNode, ServedModel } from './serving';
import type { ModelServingConfig, ServingPreset } from './servingPresets';
import {
  autoWireFormValues,
  buildAutoWireManifests,
  composeInferenceService,
  fitCheck,
  initialServeModelRequest,
  isHuggingFaceRepository,
  parseExtraArgs,
  predictorBaseUrl,
  validateServeModelRequest,
  type FitCheck,
  type ServeModelRequest,
} from './serveModel';

const config: ModelServingConfig = {
  installation: 'alpha',
  namespace: 'model-serving',
  runtime: 'kserve-vllm',
  gpuResourceName: 'nvidia.com/gpu',
  runtimeClassName: 'nvidia',
  nodeSelector: { 'gpu-pool': 'a' },
  deploymentStrategyType: 'Recreate',
  timeoutSeconds: 1800,
  cache: {
    enabled: true,
    claimName: 'hf-cache',
    mountPath: '/mnt/models',
    redirectPolicy: true,
  },
  presets: {
    namespace: 'agent-platform',
    matchingLabels: { 'agent-platform.giantswarm.io/serving-preset': 'true' },
    names: ['qwen3-8-27b'],
  },
};

const qwen: ServingPreset = {
  installation: 'alpha',
  name: 'qwen3-8-27b',
  source: 'shipped',
  displayName: 'Qwen3.8 27B (NVFP4, speculative decoding)',
  model: {
    id: 'Inferact/Qwen3.8-27B-NVFP4',
    storageUri: 'hf://Inferact/Qwen3.8-27B-NVFP4',
    format: 'vLLM',
    capabilities: ['chat', 'tools'],
  },
  runtime: 'kserve-vllm',
  args: [
    '--gpu-memory-utilization=0.60',
    '--max-model-len=262144',
    '--chat-template=/mnt/chat-template/chat-template.jinja',
  ],
  env: [{ name: 'CUTE_DSL_ARCH', value: 'sm_121a' }],
  chatTemplate: {
    configMap: 'agent-platform-chat-template-qwen3-8-27b',
    key: 'chat-template.jinja',
    mountPath: '/mnt/chat-template',
  },
  resources: {
    gpus: 1,
    requests: { cpu: '4', memory: '48Gi' },
    limits: { cpu: '8', memory: '64Gi' },
  },
  requirements: { weightsGiB: 15, overheadGiB: 30 },
  scheduling: { nodeSelector: { 'gpu-model': 'gb10' }, tolerations: [] },
  predictor: { timeout: 3600 },
};

const minimal: ServingPreset = {
  installation: 'alpha',
  name: 'tiny',
  displayName: 'Tiny',
  model: {
    id: 'org/tiny',
    storageUri: 'hf://org/tiny',
    format: 'vLLM',
    capabilities: [],
  },
  args: [],
  env: [],
  resources: { gpus: 1, requests: {}, limits: {} },
  requirements: { weightsGiB: 2, overheadGiB: 30 },
  scheduling: { nodeSelector: {}, tolerations: [] },
  predictor: {},
};

const GIB = 2 ** 30;

/** A Grace-Blackwell desktop: 1 GPU whose 120 GiB *is* the node's memory. */
const unifiedNode: GpuNode = {
  id: 'alpha/spark',
  installation: 'alpha',
  name: 'spark',
  ready: true,
  product: 'NVIDIA-GB10',
  memoryMiB: 122880,
  labeledCount: 1,
  capacity: 1,
  allocatable: 1,
  requested: 0,
  memoryAllocatableBytes: 119 * GIB,
  schedulable: true,
};

/** A discrete-GPU server: 2 × 80 GiB cards in a 512 GiB box. */
const discreteNode: GpuNode = {
  id: 'alpha/h100',
  installation: 'alpha',
  name: 'h100',
  ready: true,
  product: 'NVIDIA-H100-80GB-HBM3',
  memoryMiB: 81920,
  labeledCount: 2,
  capacity: 2,
  allocatable: 2,
  requested: 1,
  memoryAllocatableBytes: 512 * GIB,
  schedulable: true,
};

const fits: FitCheck = {
  verdict: 'fits',
  requiredGiB: 45,
  unifiedMemory: false,
  problems: [],
  notes: [],
};

describe('composeInferenceService', () => {
  it('composes the InferenceService from the preset and the discovery config', () => {
    const request: ServeModelRequest = {
      ...initialServeModelRequest(qwen, 'spark'),
      extraArgs: '--max-num-seqs=2\n\n# a comment\n--enable-prefix-caching\n',
    };

    expect(composeInferenceService({ preset: qwen, config, request })).toEqual({
      apiVersion: 'serving.kserve.io/v1beta1',
      kind: 'InferenceService',
      metadata: {
        name: 'qwen3-8-27b',
        namespace: 'model-serving',
        labels: {
          'app.kubernetes.io/managed-by': 'giantswarm-backstage',
          'agent-platform.giantswarm.io/preset': 'qwen3-8-27b',
        },
        annotations: {
          'agent-platform.giantswarm.io/model-config': 'kagent/qwen3-8-27b',
          'ui.giantswarm.io/display-name':
            'Qwen3.8 27B (NVFP4, speculative decoding)',
        },
      },
      spec: {
        predictor: {
          deploymentStrategy: { type: 'Recreate' },
          runtimeClassName: 'nvidia',
          // The preset's predictor extras win over the config's default.
          timeout: 3600,
          // config ← preset scheduling ← the chosen node.
          nodeSelector: {
            'gpu-pool': 'a',
            'gpu-model': 'gb10',
            'kubernetes.io/hostname': 'spark',
          },
          model: {
            modelFormat: { name: 'vLLM' },
            runtime: 'kserve-vllm',
            storageUri: 'hf://Inferact/Qwen3.8-27B-NVFP4',
            // The preset's args, complete and in order, then the advanced
            // field's lines (blank lines and comments dropped) appended.
            args: [
              '--gpu-memory-utilization=0.60',
              '--max-model-len=262144',
              '--chat-template=/mnt/chat-template/chat-template.jinja',
              '--max-num-seqs=2',
              '--enable-prefix-caching',
            ],
            env: [{ name: 'CUTE_DSL_ARCH', value: 'sm_121a' }],
            resources: {
              requests: { cpu: '4', memory: '48Gi', 'nvidia.com/gpu': '1' },
              limits: { cpu: '8', memory: '64Gi', 'nvidia.com/gpu': '1' },
            },
            volumeMounts: [
              {
                name: 'chat-template',
                mountPath: '/mnt/chat-template',
                readOnly: true,
              },
            ],
          },
          volumes: [
            {
              name: 'chat-template',
              configMap: { name: 'agent-platform-chat-template-qwen3-8-27b' },
            },
          ],
        },
      },
    });
  });

  it('applies the user choices: name, model source, GPU count, no node pin', () => {
    const request: ServeModelRequest = {
      ...initialServeModelRequest(minimal),
      name: 'tiny-2',
      storageUri: 'pvc://hf-cache/tiny',
      gpus: 2,
    };
    const bare: ModelServingConfig = {
      ...config,
      runtimeClassName: undefined,
      nodeSelector: {},
      deploymentStrategyType: undefined,
      timeoutSeconds: undefined,
    };

    const manifest = composeInferenceService({
      preset: minimal,
      config: bare,
      request,
    }) as any;

    expect(manifest.metadata.name).toBe('tiny-2');
    expect(
      manifest.metadata.annotations[
        'agent-platform.giantswarm.io/model-config'
      ],
    ).toBe('kagent/tiny-2');
    expect(manifest.spec.predictor).toEqual({
      model: {
        modelFormat: { name: 'vLLM' },
        // No runtime on the preset: the config's.
        runtime: 'kserve-vllm',
        storageUri: 'pvc://hf-cache/tiny',
        args: [],
        resources: {
          requests: { 'nvidia.com/gpu': '2' },
          limits: { 'nvidia.com/gpu': '2' },
        },
      },
    });
  });

  it('requests no GPU resource for a 0-GPU request', () => {
    const request = { ...initialServeModelRequest(minimal), gpus: 0 };
    const manifest = composeInferenceService({
      preset: minimal,
      config,
      request,
    }) as any;

    expect(manifest.spec.predictor.model.resources).toBeUndefined();
  });
});

describe('parseExtraArgs', () => {
  it('takes one argument per line, dropping blanks and comments', () => {
    expect(
      parseExtraArgs(
        '  --a=1 \n\n# note\n--limit-mm-per-prompt\n{"image": 1}\n',
      ),
    ).toEqual(['--a=1', '--limit-mm-per-prompt', '{"image": 1}']);
  });
});

describe('validateServeModelRequest', () => {
  const valid = initialServeModelRequest(qwen, 'spark');

  it('accepts a request straight from the preset', () => {
    expect(
      validateServeModelRequest(valid, { existingNames: [], fit: fits }),
    ).toEqual([]);
  });

  it('checks the name', () => {
    expect(
      validateServeModelRequest(
        { ...valid, name: '' },
        { existingNames: [], fit: fits },
      ),
    ).toEqual(['Name is required']);
    expect(
      validateServeModelRequest(
        { ...valid, name: 'Qwen_3' },
        { existingNames: [], fit: fits },
      )[0],
    ).toMatch(/lowercase/);
    expect(
      validateServeModelRequest(valid, {
        existingNames: ['qwen3-8-27b'],
        fit: fits,
      }),
    ).toEqual(['A served model named "qwen3-8-27b" already exists there']);
  });

  it('checks the model source and GPU count', () => {
    expect(
      validateServeModelRequest(
        { ...valid, storageUri: 'Qwen/Qwen3-14B' },
        { existingNames: [], fit: fits },
      )[0],
    ).toMatch(/hf:\/\//);
    expect(
      validateServeModelRequest(
        { ...valid, gpus: 1.5 },
        { existingNames: [], fit: fits },
      ),
    ).toEqual(['GPUs must be a whole number']);
  });

  it('refuses advanced args that override the runtime or the preset', () => {
    expect(
      validateServeModelRequest(
        {
          ...valid,
          extraArgs:
            '--served-model-name=other\n--port\n8000\n--chat-template=/x',
        },
        { existingNames: [], fit: fits },
      ),
    ).toEqual([
      '--served-model-name=other, --port, --chat-template=/x are set by the runtime or the preset and cannot be overridden here',
    ]);
  });

  it('blocks a model that does not fit until acknowledged', () => {
    const doesNotFit: FitCheck = {
      ...fits,
      verdict: 'doesNotFit',
      problems: ['too big'],
    };

    expect(
      validateServeModelRequest(valid, { existingNames: [], fit: doesNotFit }),
    ).toEqual([
      'The model does not fit the target node — tick the acknowledgement to serve it anyway',
    ]);
    expect(
      validateServeModelRequest(
        { ...valid, acknowledgeFit: true },
        { existingNames: [], fit: doesNotFit },
      ),
    ).toEqual([]);
  });

  it('blocks a preset written for other weights until acknowledged', () => {
    expect(
      validateServeModelRequest(valid, {
        existingNames: [],
        fit: fits,
        presetMismatch: true,
      }),
    ).toEqual([
      'The preset was written for another model — tick the acknowledgement to serve these weights with it anyway',
    ]);
    expect(
      validateServeModelRequest(
        { ...valid, acknowledgePresetMismatch: true },
        { existingNames: [], fit: fits, presetMismatch: true },
      ),
    ).toEqual([]);
  });
});

describe('isHuggingFaceRepository', () => {
  it('accepts owner/name and rejects bare directory names', () => {
    expect(isHuggingFaceRepository('Qwen/Qwen3-14B')).toBe(true);
    expect(isHuggingFaceRepository('glm-47-flash-awq4')).toBe(false);
    expect(isHuggingFaceRepository('a/b/c')).toBe(false);
    expect(isHuggingFaceRepository('owner/name:rev')).toBe(false);
    expect(isHuggingFaceRepository('/name')).toBe(false);
  });
});

describe('fitCheck', () => {
  it('cannot decide without a node, but says what is needed', () => {
    const result = fitCheck({ preset: qwen, gpus: 1 });

    expect(result.verdict).toBe('unknown');
    expect(result.requiredGiB).toBe(45);
    expect(result.notes[0]).toMatch(
      /about 45 GiB .*15 GiB of weights \+ 30 GiB of headroom/,
    );
  });

  it('uses the node memory on a unified-memory node and says it is conservative', () => {
    const result = fitCheck({ preset: qwen, gpus: 1, node: unifiedNode });

    expect(result).toMatchObject({
      verdict: 'fits',
      requiredGiB: 45,
      budgetGiB: 119,
      budgetSource: 'nodeMemory',
      unifiedMemory: true,
      problems: [],
    });
    expect(result.notes.join(' ')).toMatch(/unified memory/);
    expect(result.notes.join(' ')).toMatch(/spark has 119 GiB allocatable/);
  });

  it('blocks a model that does not fit the unified-memory node', () => {
    const big: ServingPreset = {
      ...qwen,
      requirements: { weightsGiB: 100, overheadGiB: 30 },
    };

    const result = fitCheck({ preset: big, gpus: 1, node: unifiedNode });

    expect(result.verdict).toBe('doesNotFit');
    expect(result.problems).toEqual([
      'Needs about 130 GiB of memory (100 GiB of weights + 30 GiB of headroom), but spark has 119 GiB allocatable. vLLM would fail to load the model.',
    ]);
  });

  it('uses the requested GPUs’ memory on a discrete-GPU node', () => {
    const big: ServingPreset = {
      ...qwen,
      requirements: { weightsGiB: 100, overheadGiB: 30 },
    };

    // 130 GiB does not fit one 80 GiB card …
    expect(
      fitCheck({ preset: big, gpus: 1, node: discreteNode }),
    ).toMatchObject({
      verdict: 'doesNotFit',
      budgetGiB: 80,
      budgetSource: 'gpuMemory',
      unifiedMemory: false,
    });
    // … but fits two (tensor parallel), with a note that only one is free now.
    const two = fitCheck({ preset: big, gpus: 2, node: discreteNode });
    expect(two).toMatchObject({
      verdict: 'fits',
      budgetGiB: 160,
      budgetSource: 'gpuMemory',
    });
    expect(two.notes.join(' ')).toMatch(
      /Only 1 of h100's GPUs is free right now/,
    );
  });

  it('blocks more GPUs than the node has', () => {
    const result = fitCheck({ preset: qwen, gpus: 3, node: discreteNode });

    expect(result.verdict).toBe('doesNotFit');
    expect(result.problems[0]).toBe('Requests 3 GPUs, but h100 has 2.');
  });

  it('falls back to node memory, flagged as an estimate, without a GPU memory label', () => {
    const unlabelled: GpuNode = {
      id: 'alpha/lab',
      installation: 'alpha',
      name: 'lab',
      ready: true,
      memoryAllocatableBytes: 86 * GIB,
    };

    const result = fitCheck({ preset: qwen, gpus: 1, node: unlabelled });

    expect(result).toMatchObject({
      verdict: 'fits',
      budgetGiB: 86,
      budgetSource: 'nodeMemory',
      unifiedMemory: false,
    });
    expect(result.notes.join(' ')).toMatch(/no GPU memory label/);
  });

  it('cannot decide on a node without any memory data', () => {
    const bare: GpuNode = {
      id: 'alpha/x',
      installation: 'alpha',
      name: 'x',
      ready: true,
    };

    const result = fitCheck({ preset: qwen, gpus: 1, node: bare });

    expect(result.verdict).toBe('unknown');
    expect(result.notes.join(' ')).toMatch(/cannot be checked/);
  });

  it('notes a cordoned node', () => {
    const result = fitCheck({
      preset: qwen,
      gpus: 1,
      node: { ...unifiedNode, schedulable: false },
    });

    expect(result.notes.join(' ')).toMatch(/cordoned/);
  });
});

const served: ServedModel = {
  id: 'alpha/kserve/model-serving/qwen3-8-27b',
  installation: 'alpha',
  backend: 'kserve',
  name: 'qwen3-8-27b',
  namespace: 'model-serving',
  readiness: 'ready',
  internalUrl: 'http://qwen3-8-27b-predictor.model-serving.svc.cluster.local',
  endpointHosts: [],
  displayName: 'Qwen3.8 27B',
  preset: 'qwen3-8-27b',
  managedByPortal: true,
  autoWire: { namespace: 'kagent', name: 'qwen3-8-27b' },
};

describe('predictorBaseUrl', () => {
  it('appends /v1 to the predictor address from the status', () => {
    expect(predictorBaseUrl(served)).toBe(
      'http://qwen3-8-27b-predictor.model-serving.svc.cluster.local/v1',
    );
    expect(predictorBaseUrl({ ...served, internalUrl: 'http://x.svc/' })).toBe(
      'http://x.svc/v1',
    );
  });

  it('falls back to the predictor Service name KServe always creates', () => {
    expect(predictorBaseUrl({ ...served, internalUrl: undefined })).toBe(
      'http://qwen3-8-27b-predictor.model-serving.svc.cluster.local/v1',
    );
  });
});

describe('buildAutoWireManifests', () => {
  it('writes the placeholder Secret and an OpenAI ModelConfig on the predictor', () => {
    expect(autoWireFormValues(served, { name: 'qwen3-8-27b' })).toEqual({
      name: 'qwen3-8-27b',
      displayName: 'Qwen3.8 27B',
      provider: 'OpenAI',
      // The runtime serves the model under the InferenceService name.
      model: 'qwen3-8-27b',
      endpoint:
        'http://qwen3-8-27b-predictor.model-serving.svc.cluster.local/v1',
      insecureSkipTlsVerify: false,
      apiKey: '',
      keyless: true,
    });

    const { secret, modelConfig } = buildAutoWireManifests(served, {
      namespace: 'kagent',
      name: 'qwen3-8-27b',
    });

    expect(secret.name).toBe('kagent-qwen3-8-27b');
    expect(secret.manifest).toMatchObject({
      kind: 'Secret',
      metadata: { name: 'kagent-qwen3-8-27b', namespace: 'kagent' },
      stringData: { OPENAI_API_KEY: 'giantswarm-backstage-placeholder' },
    });
    expect(secret.patch).toEqual({
      data: null,
      stringData: { OPENAI_API_KEY: 'giantswarm-backstage-placeholder' },
    });
    expect(modelConfig).toEqual({
      apiVersion: 'kagent.dev/v1alpha2',
      kind: 'ModelConfig',
      metadata: {
        name: 'qwen3-8-27b',
        namespace: 'kagent',
        labels: { 'app.kubernetes.io/managed-by': 'giantswarm-backstage' },
        annotations: { 'ui.giantswarm.io/display-name': 'Qwen3.8 27B' },
      },
      spec: {
        provider: 'OpenAI',
        model: 'qwen3-8-27b',
        apiKeySecret: 'kagent-qwen3-8-27b',
        apiKeySecretKey: 'OPENAI_API_KEY',
        openAI: {
          baseUrl:
            'http://qwen3-8-27b-predictor.model-serving.svc.cluster.local/v1',
        },
      },
    });
  });
});
