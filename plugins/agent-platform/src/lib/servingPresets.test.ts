import { ConfigMap } from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  AGENT_PLATFORM_PRESET_LABEL,
  AGENT_PLATFORM_PRESET_SOURCE_LABEL,
  DEFAULT_OVERHEAD_GIB,
  parseEqualitySelector,
  parseModelServingConfigMap,
  parseServingPresetConfigMap,
  presetRequiredGiB,
  SERVING_PRESET_LABEL,
} from './servingPresets';

function configMap(
  name: string,
  data: Record<string, string>,
  labels: Record<string, string> = {},
  namespace = 'agent-platform',
): ConfigMap {
  return new ConfigMap(
    {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: { name, namespace, labels },
      data,
    },
    'alpha',
  );
}

// What agent-platform-standalone 0.10.0 renders with the component on
// (comments included — the chart keeps them in the published document).
const DISCOVERY_YAML = `apiVersion: agent-platform.giantswarm.io/v1alpha1
kind: ModelServingConfig
spec:
  # The namespace InferenceServices are created in.
  namespace: model-serving
  runtime: kserve-vllm
  gpuResourceName: nvidia.com/gpu
  runtimeClassName: ""
  nodeSelector: {}
  deploymentStrategyType: Recreate
  timeoutSeconds: 1800
  cache:
    enabled: true
    claimName: hf-cache
    mountPath: /mnt/models
    redirectPolicy: false
  presets:
    namespace: agent-platform
    labelSelector: agent-platform.giantswarm.io/serving-preset=true
    names:
      - qwen3-14b
      - qwen3-8-27b
`;

const QWEN3_8_27B_YAML = `apiVersion: agent-platform.giantswarm.io/v1alpha1
kind: ServingPreset
metadata:
  name: qwen3-8-27b
spec:
  args:
  - --gpu-memory-utilization=0.60
  - --max-model-len=262144
  - --speculative-config
  - '{"method":"dflash","model":"z-lab/Qwen3.8-27B-DFlash2","num_speculative_tokens":7}'
  - --chat-template=/mnt/chat-template/chat-template.jinja
  chatTemplate:
    configMap: agent-platform-chat-template-qwen3-8-27b
    key: chat-template.jinja
    mountPath: /mnt/chat-template
  description: |
    Dense 27B coding and agent model.
  displayName: Qwen3.8 27B (NVFP4, speculative decoding)
  env:
  - name: CUTE_DSL_ARCH
    value: sm_121a
  model:
    capabilities:
    - chat
    - tools
    contextLength: 262144
    format: vLLM
    id: Inferact/Qwen3.8-27B-NVFP4
    license: apache-2.0
    storageUri: hf://Inferact/Qwen3.8-27B-NVFP4
  predictor:
    timeout: 1800
  requirements:
    overheadGiB: 30
    weightsGiB: 15
  resources:
    gpus: 1
    limits:
      cpu: "8"
      memory: 64Gi
    requests:
      cpu: "4"
      memory: 48Gi
  runtime: kserve-vllm
`;

describe('parseModelServingConfigMap', () => {
  it('reads the published discovery document', () => {
    const result = parseModelServingConfigMap(
      configMap('agent-platform-model-serving', {
        'config.yaml': DISCOVERY_YAML,
      }),
    );

    expect(result).toEqual({
      ok: true,
      config: {
        installation: 'alpha',
        namespace: 'model-serving',
        runtime: 'kserve-vllm',
        gpuResourceName: 'nvidia.com/gpu',
        // An empty RuntimeClass means "cluster default", not a class named "".
        runtimeClassName: undefined,
        nodeSelector: {},
        deploymentStrategyType: 'Recreate',
        timeoutSeconds: 1800,
        cache: {
          enabled: true,
          claimName: 'hf-cache',
          mountPath: '/mnt/models',
          redirectPolicy: false,
        },
        presets: {
          namespace: 'agent-platform',
          matchingLabels: { [SERVING_PRESET_LABEL]: 'true' },
          names: ['qwen3-14b', 'qwen3-8-27b'],
        },
      },
    });
  });

  it('fills the defaults the chart may leave out', () => {
    const result = parseModelServingConfigMap(
      configMap('agent-platform-model-serving', {
        'config.yaml': `apiVersion: agent-platform.giantswarm.io/v1alpha1
kind: ModelServingConfig
spec:
  namespace: serving
  runtime: vllm
  presets:
    namespace: platform
`,
      }),
    );

    expect(result).toMatchObject({
      ok: true,
      config: {
        gpuResourceName: 'nvidia.com/gpu',
        cache: {
          enabled: false,
          claimName: undefined,
          mountPath: undefined,
          redirectPolicy: false,
        },
        presets: {
          matchingLabels: { [SERVING_PRESET_LABEL]: 'true' },
          names: [],
        },
      },
    });
  });

  it('rejects a ConfigMap without the document or with the wrong kind', () => {
    expect(
      parseModelServingConfigMap(configMap('x', { other: 'y' })),
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining('config.yaml'),
    });

    expect(
      parseModelServingConfigMap(
        configMap('x', {
          'config.yaml': 'apiVersion: v1\nkind: ConfigMap\nspec: {}\n',
        }),
      ),
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining('not a ModelServingConfig'),
    });

    expect(
      parseModelServingConfigMap(configMap('x', { 'config.yaml': ': [' })),
    ).toMatchObject({ ok: false, error: expect.stringContaining('YAML') });
  });
});

describe('parseServingPresetConfigMap', () => {
  it('reads a published preset with a chat template, env and predictor extras', () => {
    const result = parseServingPresetConfigMap(
      configMap(
        'agent-platform-serving-preset-qwen3-8-27b',
        { 'preset.yaml': QWEN3_8_27B_YAML },
        {
          [SERVING_PRESET_LABEL]: 'true',
          [AGENT_PLATFORM_PRESET_LABEL]: 'qwen3-8-27b',
          [AGENT_PLATFORM_PRESET_SOURCE_LABEL]: 'shipped',
        },
      ),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const { preset } = result;
    expect(preset).toMatchObject({
      installation: 'alpha',
      name: 'qwen3-8-27b',
      source: 'shipped',
      displayName: 'Qwen3.8 27B (NVFP4, speculative decoding)',
      description: 'Dense 27B coding and agent model.\n',
      model: {
        id: 'Inferact/Qwen3.8-27B-NVFP4',
        storageUri: 'hf://Inferact/Qwen3.8-27B-NVFP4',
        format: 'vLLM',
        contextLength: 262144,
        capabilities: ['chat', 'tools'],
        license: 'apache-2.0',
      },
      runtime: 'kserve-vllm',
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
      scheduling: { nodeSelector: {}, tolerations: [] },
      predictor: { timeout: 1800 },
    });
    // Args are taken literally and in order; the chart's chat-template flag is last.
    expect(preset.args).toHaveLength(5);
    expect(preset.args[4]).toBe(
      '--chat-template=/mnt/chat-template/chat-template.jinja',
    );
    expect(presetRequiredGiB(preset)).toBe(45);
  });

  it('fills the schema defaults for a minimal preset', () => {
    const result = parseServingPresetConfigMap(
      configMap('agent-platform-serving-preset-tiny', {
        'preset.yaml': `apiVersion: agent-platform.giantswarm.io/v1alpha1
kind: ServingPreset
metadata:
  name: tiny
spec:
  displayName: Tiny
  model:
    id: org/tiny
    storageUri: hf://org/tiny
  requirements:
    weightsGiB: 2
`,
      }),
    );

    expect(result).toEqual({
      ok: true,
      preset: {
        installation: 'alpha',
        name: 'tiny',
        source: undefined,
        displayName: 'Tiny',
        description: undefined,
        model: {
          id: 'org/tiny',
          storageUri: 'hf://org/tiny',
          format: 'vLLM',
          contextLength: undefined,
          capabilities: [],
          license: undefined,
        },
        runtime: undefined,
        args: [],
        env: [],
        chatTemplate: undefined,
        resources: { gpus: 1, requests: {}, limits: {} },
        requirements: { weightsGiB: 2, overheadGiB: DEFAULT_OVERHEAD_GIB },
        scheduling: { nodeSelector: {}, tolerations: [] },
        predictor: {},
      },
    });
  });

  it('names the preset it could not use', () => {
    // An authoring-form chat template (file) is not usable: only the chart
    // resolves it into a ConfigMap.
    const result = parseServingPresetConfigMap(
      configMap(
        'agent-platform-serving-preset-broken',
        {
          'preset.yaml': `apiVersion: agent-platform.giantswarm.io/v1alpha1
kind: ServingPreset
metadata:
  name: broken
spec:
  displayName: Broken
  model:
    id: org/broken
    storageUri: hf://org/broken
  chatTemplate:
    file: broken.jinja
  requirements:
    weightsGiB: 2
`,
        },
        { [AGENT_PLATFORM_PRESET_LABEL]: 'broken' },
      ),
    );

    expect(result).toMatchObject({
      ok: false,
      name: 'broken',
      error: expect.stringContaining('chatTemplate.configMap'),
    });
  });

  it('falls back to the ConfigMap name when the preset label is missing', () => {
    expect(
      parseServingPresetConfigMap(configMap('some-configmap', {})),
    ).toMatchObject({
      ok: false,
      name: 'some-configmap',
      error: expect.stringContaining('preset.yaml'),
    });
  });
});

describe('parseEqualitySelector', () => {
  it('reads equality terms and drops what matchingLabels cannot express', () => {
    expect(parseEqualitySelector('a=b, c == d,e!=f,g in (x),h')).toEqual({
      a: 'b',
      c: 'd',
    });
    expect(parseEqualitySelector(undefined)).toEqual({});
  });
});
