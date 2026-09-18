import { ConfigMap } from '@giantswarm/backstage-plugin-kubernetes-react';
import { parseModelServingConfigMap } from './modelServingConfig';

function configMap(
  name: string,
  data: Record<string, string>,
  namespace = 'agent-platform',
): ConfigMap {
  return new ConfigMap(
    {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: { name, namespace },
      data,
    },
    'alpha',
  );
}

// What the connectivity chart renders with the serving component on
// (comments included — the chart keeps them in the published document).
const DISCOVERY_YAML = `apiVersion: agent-platform.giantswarm.io/v1alpha1
kind: ModelServingConfig
spec:
  # The namespace the LLMInferenceServices are created in.
  namespace: model-serving
  gpuResourceName: nvidia.com/gpu
  runtimeClassName: ""
  nodeSelector: {}
  gpuPool:
    taint:
      key: nvidia.com/gpu
      value: ""
      effect: NoSchedule
    nodeSelector:
      giantswarm.io/machine-pool: gpu-l4
  networkPolicy:
    enabled: true
    flavor: cilium
  cache:
    enabled: true
    claimName: hf-cache
    mountPath: /mnt/models
    redirectPolicy: true
  gateway:
    enabled: true
    name: models
    namespace: agent-platform
    endpoint: https://models.example.test/
    pathConvention: /<namespace>/<model>/v1
  modelImages:
    registry: ""
  presets:
    namespace: agent-platform
    labelSelector: agent-platform.giantswarm.io/serving-preset=true
    names:
      - qwen3-8-27b
`;

describe('parseModelServingConfigMap', () => {
  it('reads what the portal needs from the published document', () => {
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
        gpuResourceName: 'nvidia.com/gpu',
        gateway: {
          // Trailing slashes dropped: the route is `<origin>/<namespace>/<model>`.
          endpoint: 'https://models.example.test',
          pathConvention: '/<namespace>/<model>/v1',
        },
      },
    });
  });

  it('fills the defaults the chart may leave out, and knows no Gateway where none is rendered', () => {
    const result = parseModelServingConfigMap(
      configMap('agent-platform-model-serving', {
        'config.yaml': `apiVersion: agent-platform.giantswarm.io/v1alpha1
kind: ModelServingConfig
spec:
  namespace: serving
  gateway:
    enabled: false
  presets:
    namespace: platform
`,
      }),
    );

    expect(result).toEqual({
      ok: true,
      config: {
        installation: 'alpha',
        namespace: 'serving',
        gpuResourceName: 'nvidia.com/gpu',
        gateway: undefined,
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
