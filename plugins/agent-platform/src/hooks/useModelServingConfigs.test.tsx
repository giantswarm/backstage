import { renderHook } from '@testing-library/react';
import { ConfigMap } from '@giantswarm/backstage-plugin-kubernetes-react';
import { useModelServingConfigs } from './useModelServingConfigs';

const mockUseResources = jest.fn();

jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  useResources: (...args: unknown[]) => mockUseResources(...args),
}));

function configMap(
  installation: string,
  name: string,
  namespace: string,
  data: Record<string, string>,
) {
  return new ConfigMap(
    {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name,
        namespace,
        labels: { 'agent-platform.giantswarm.io/model-serving-config': 'true' },
      },
      data,
    },
    installation,
  );
}

const discoveryYaml = (
  gpuResourceName = 'nvidia.com/gpu',
) => `apiVersion: agent-platform.giantswarm.io/v1alpha1
kind: ModelServingConfig
spec:
  namespace: model-serving
  gpuResourceName: ${gpuResourceName}
  gateway:
    enabled: true
    endpoint: https://models.example.test
    pathConvention: /<namespace>/<model>/v1
  presets:
    namespace: agent-platform
    labelSelector: agent-platform.giantswarm.io/serving-preset=true
`;

beforeEach(() => {
  mockUseResources.mockReset();
});

describe('useModelServingConfigs', () => {
  it('finds the discovery ConfigMap by label on every installation and reads it', () => {
    mockUseResources.mockReturnValue({
      resources: [
        configMap('alpha', 'agent-platform-model-serving', 'agent-platform', {
          'config.yaml': discoveryYaml('amd.com/gpu'),
        }),
      ],
      errors: [],
      isLoading: false,
    });

    const { result } = renderHook(() =>
      useModelServingConfigs(['alpha', 'beta']),
    );

    // A cluster-wide, label-filtered list: the release namespace is not known.
    const [clusters, , options, queryOptions] = mockUseResources.mock.calls[0];
    expect(clusters).toEqual(['alpha', 'beta']);
    expect(options.alpha).toEqual({
      labelSelector: {
        matchingLabels: {
          'agent-platform.giantswarm.io/model-serving-config': 'true',
        },
      },
    });
    expect(options.alpha).not.toHaveProperty('namespace');
    expect(queryOptions).toMatchObject({ enableDiscovery: false });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.configs.alpha).toMatchObject({
      installation: 'alpha',
      namespace: 'model-serving',
      gpuResourceName: 'amd.com/gpu',
      gateway: { endpoint: 'https://models.example.test' },
    });
    expect(result.current.configs.beta).toBeUndefined();
    expect(result.current.problems).toEqual([]);
  });

  it('reports a forbidden read, a document that does not parse, and a second document', () => {
    mockUseResources.mockReturnValue({
      resources: [
        configMap('alpha', 'agent-platform-model-serving', 'agent-platform', {
          'config.yaml': 'kind: Nope\n',
        }),
        configMap('gamma', 'one', 'agent-platform', {
          'config.yaml': discoveryYaml(),
        }),
        configMap('gamma', 'two', 'other', {
          'config.yaml': discoveryYaml(),
        }),
      ],
      errors: [
        {
          cluster: 'beta',
          type: 'list',
          error: Object.assign(new Error('configmaps is forbidden'), {
            name: 'ForbiddenError',
          }),
        },
        // An installation without the API version is not a read failure.
        {
          cluster: 'delta',
          type: 'incompatibility',
          error: new Error('no version'),
        },
      ],
      isLoading: false,
    });

    const { result } = renderHook(() =>
      useModelServingConfigs(['alpha', 'beta', 'gamma', 'delta']),
    );

    expect(result.current.configs.alpha).toBeUndefined();
    expect(result.current.configs.gamma?.namespace).toBe('model-serving');
    expect(result.current.problems).toEqual([
      {
        installation: 'alpha',
        message: expect.stringContaining('not a ModelServingConfig'),
      },
      {
        installation: 'gamma',
        message: expect.stringContaining('ignoring other/two'),
      },
      { installation: 'beta', message: 'configmaps is forbidden' },
    ]);
  });

  it('is loading while the list is', () => {
    mockUseResources.mockReturnValue({
      resources: [],
      errors: [],
      isLoading: true,
    });

    const { result } = renderHook(() => useModelServingConfigs(['alpha']));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.configs).toEqual({});
  });
});
