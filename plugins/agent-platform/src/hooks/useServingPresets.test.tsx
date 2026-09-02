import { renderHook } from '@testing-library/react';
import { ConfigMap } from '@giantswarm/backstage-plugin-kubernetes-react';
import { buildResourceErrors } from '../components/resourceErrorFixtures';
import { useServingPresets } from './useServingPresets';

// `useResources` is mocked and answers by call shape: the discovery list has
// no namespace in its options, the preset list does.
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
  labels: Record<string, string> = {},
) {
  return new ConfigMap(
    {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: { name, namespace, labels },
      data,
    },
    installation,
  );
}

const discoveryYaml = (
  namespace = 'agent-platform',
) => `apiVersion: agent-platform.giantswarm.io/v1alpha1
kind: ModelServingConfig
spec:
  namespace: model-serving
  runtime: kserve-vllm
  presets:
    namespace: ${namespace}
    labelSelector: agent-platform.giantswarm.io/serving-preset=true
`;

const presetYaml = (
  name: string,
  displayName: string,
) => `apiVersion: agent-platform.giantswarm.io/v1alpha1
kind: ServingPreset
metadata:
  name: ${name}
spec:
  displayName: ${displayName}
  model:
    id: org/${name}
    storageUri: hf://org/${name}
  requirements:
    weightsGiB: 10
`;

type Answer = {
  resources?: ConfigMap[];
  errors?: unknown[];
  isLoading?: boolean;
};

function answer({ resources = [], errors = [], isLoading = false }: Answer) {
  return { resources, errors, isLoading };
}

function mockLists(discovery: Answer, presets: Answer) {
  mockUseResources.mockImplementation(
    (_clusters: string[], _cls: unknown, options: Record<string, any>) => {
      const isPresetList = Object.values(options).some(
        option => option?.namespace,
      );
      return answer(isPresetList ? presets : discovery);
    },
  );
}

beforeEach(() => {
  mockUseResources.mockReset();
});

describe('useServingPresets', () => {
  it('finds the discovery ConfigMap by label and lists the presets where it says', () => {
    mockLists(
      {
        resources: [
          configMap('alpha', 'agent-platform-model-serving', 'agent-platform', {
            'config.yaml': discoveryYaml('platform-ns'),
          }),
        ],
      },
      {
        resources: [
          configMap(
            'alpha',
            'agent-platform-serving-preset-zeta',
            'platform-ns',
            { 'preset.yaml': presetYaml('zeta', 'Zeta') },
            { 'agent-platform.giantswarm.io/preset': 'zeta' },
          ),
          configMap(
            'alpha',
            'agent-platform-serving-preset-alpha',
            'platform-ns',
            { 'preset.yaml': presetYaml('alpha-model', 'Alpha') },
            { 'agent-platform.giantswarm.io/preset': 'alpha-model' },
          ),
        ],
      },
    );

    const { result } = renderHook(() => useServingPresets(['alpha', 'beta']));

    // Discovery: a cluster-wide, label-filtered list on every installation.
    const [discoveryClusters, , discoveryOptions] =
      mockUseResources.mock.calls[0];
    expect(discoveryClusters).toEqual(['alpha', 'beta']);
    expect(discoveryOptions.alpha).toEqual({
      labelSelector: {
        matchingLabels: {
          'agent-platform.giantswarm.io/model-serving-config': 'true',
        },
      },
    });
    // Presets: only where discovery answered, in the namespace it names.
    const [presetClusters, , presetOptions] = mockUseResources.mock.calls[1];
    expect(presetClusters).toEqual(['alpha']);
    expect(presetOptions.alpha).toEqual({
      namespace: 'platform-ns',
      labelSelector: {
        matchingLabels: {
          'agent-platform.giantswarm.io/serving-preset': 'true',
        },
      },
    });

    expect(result.current.installations).toEqual(['alpha']);
    expect(result.current.configFor('alpha')?.namespace).toBe('model-serving');
    expect(result.current.configFor('beta')).toBeUndefined();
    // Sorted by display name.
    expect(result.current.presetsFor('alpha').map(p => p.displayName)).toEqual([
      'Alpha',
      'Zeta',
    ]);
    expect(result.current.presetsFor('beta')).toEqual([]);
    expect(result.current.problems).toEqual([]);
    expect(result.current.invalidPresets).toEqual([]);
  });

  it('reports a forbidden discovery read and an unusable preset by name', () => {
    mockLists(
      {
        resources: [
          configMap('alpha', 'agent-platform-model-serving', 'agent-platform', {
            'config.yaml': discoveryYaml(),
          }),
        ],
        errors: buildResourceErrors({ failed: ['beta'] }).map(e => ({
          ...e,
          error: Object.assign(new Error('configmaps is forbidden'), e.error),
        })),
      },
      {
        resources: [
          configMap(
            'alpha',
            'agent-platform-serving-preset-broken',
            'agent-platform',
            { 'preset.yaml': 'kind: Nope\n' },
            { 'agent-platform.giantswarm.io/preset': 'broken' },
          ),
        ],
      },
    );

    const { result } = renderHook(() => useServingPresets(['alpha', 'beta']));

    expect(result.current.problems).toEqual([
      { installation: 'beta', message: 'configmaps is forbidden' },
    ]);
    expect(result.current.invalidPresets).toEqual([
      {
        installation: 'alpha',
        name: 'broken',
        error: expect.stringContaining('not a published ServingPreset'),
      },
    ]);
    expect(result.current.presetsFor('alpha')).toEqual([]);
  });

  it('offers nothing on an installation without the discovery ConfigMap', () => {
    mockLists({ resources: [] }, { resources: [] });

    const { result } = renderHook(() => useServingPresets(['alpha']));

    expect(result.current.installations).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    // No preset list is even attempted.
    expect(mockUseResources.mock.calls[1][0]).toEqual([]);
  });

  it('is loading while either list is', () => {
    mockLists({ resources: [], isLoading: true }, { resources: [] });

    const { result } = renderHook(() => useServingPresets(['alpha']));

    expect(result.current.isLoading).toBe(true);
  });
});
