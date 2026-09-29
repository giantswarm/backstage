import { renderHook } from '@testing-library/react';
import {
  ConfigMap,
  LLMInferenceService,
  Node,
  type LLMInferenceServiceInterface,
  type NodeInterface,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { buildResourceErrors } from '../resourceErrorFixtures';
import {
  useKServeServingSource,
  type KServeInstallations,
} from './useKServeServingSource';

// The inventory's KServe verdict is handed in, and the two fetch layers are
// mocked, so each fixture drives the merge logic directly: which installations
// have KServe, what their LLMInferenceServices, nodes and pods say, and how
// failures at each layer surface.
const kserveInstallations = jest.fn<KServeInstallations, []>();
const mockUseResources = jest.fn();
const mockUsePodLists = jest.fn();

jest.mock('../../hooks/usePodLists', () => ({
  usePodLists: (...args: unknown[]) => mockUsePodLists(...args),
}));

jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => {
  const actual = jest.requireActual(
    '@giantswarm/backstage-plugin-kubernetes-react',
  );
  return {
    ...actual,
    useResources: (...args: unknown[]) => mockUseResources(...args),
  };
});

const WORKLOAD_SELECTOR = 'app.kubernetes.io/part-of=llminferenceservice';

function llmisvc(
  installation: string,
  name: string,
  ready: boolean | undefined,
  gpus = '1',
): LLMInferenceService {
  const status: LLMInferenceServiceInterface['status'] =
    ready === undefined
      ? undefined
      : {
          observedGeneration: 1,
          url: `https://models.example.test/kserve/${name}`,
          conditions: [
            {
              type: 'Ready',
              status: ready ? 'True' : 'False',
              message: ready
                ? undefined
                : 'Deployment does not have minimum availability.',
            },
          ],
        };
  return new LLMInferenceService(
    {
      apiVersion: 'serving.kserve.io/v1alpha2',
      kind: 'LLMInferenceService',
      metadata: { name, namespace: 'kserve', generation: 1 },
      spec: {
        model: { uri: `hf://org/${name}`, name: `org/${name}` },
        template: {
          nodeSelector: { 'kubernetes.io/hostname': 'gpu-node-1' },
          containers: [
            {
              name: 'main',
              resources: { requests: { 'nvidia.com/gpu': gpus } },
            },
          ],
        },
      },
      status,
    } as LLMInferenceServiceInterface,
    installation,
  );
}

function node(
  installation: string,
  name: string,
  overrides: Partial<NodeInterface> = {},
): Node {
  return new Node(
    {
      apiVersion: 'v1',
      kind: 'Node',
      metadata: { name },
      status: { conditions: [{ type: 'Ready', status: 'True' }] },
      ...overrides,
    } as NodeInterface,
    installation,
  );
}

const gpuNodeWithPlugin = (installation: string) =>
  node(installation, 'gpu-node-1', {
    metadata: {
      name: 'gpu-node-1',
      labels: {
        'nvidia.com/gpu.product': 'NVIDIA-GB10',
        'nvidia.com/gpu.memory': '122880',
        'nvidia.com/gpu.count': '1',
      },
    },
    status: {
      conditions: [{ type: 'Ready', status: 'True' }],
      capacity: { 'nvidia.com/gpu': '1' },
      allocatable: { 'nvidia.com/gpu': '1' },
    },
  });

const gpuNodeLabelsOnly = (installation: string) =>
  node(installation, 'lab-node', {
    metadata: {
      name: 'lab-node',
      labels: { 'nvidia.com/gpu.product': 'NVIDIA-GB10' },
    },
  });

/**
 * The installation's discovery ConfigMap, naming the resource its accelerators
 * go by and the models Gateway its routes attach to.
 */
const discoveryConfigMap = (
  installation: string,
  gpuResourceName: string,
  gateway?: string,
) =>
  new ConfigMap(
    {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name: 'agent-platform-model-serving',
        namespace: 'agent-platform',
        labels: { 'agent-platform.giantswarm.io/model-serving-config': 'true' },
      },
      data: {
        'config.yaml': `apiVersion: agent-platform.giantswarm.io/v1alpha1
kind: ModelServingConfig
spec:
  namespace: model-serving
  gpuResourceName: ${gpuResourceName}
  gateway:
    enabled: ${gateway ? 'true' : 'false'}
${gateway ? `    endpoint: ${gateway}\n` : ''}  presets:
    namespace: agent-platform
`,
      },
    },
    installation,
  );

type ResourcesResult = {
  resources?: unknown[];
  errors?: ReturnType<typeof buildResourceErrors>;
  isLoading?: boolean;
};

/** Route `useResources` calls by resource class. */
function mockResources(byClass: {
  objects?: ResourcesResult;
  nodes?: ResourcesResult;
  /** The discovery ConfigMaps ({@link discoveryConfigMap}); none by default. */
  configMaps?: ResourcesResult;
}) {
  mockUseResources.mockImplementation((_clusters, ResourceClass) => {
    let result: ResourcesResult | undefined;
    if (ResourceClass === LLMInferenceService) {
      result = byClass.objects;
    } else if (ResourceClass === ConfigMap) {
      result = byClass.configMaps;
    } else {
      result = byClass.nodes;
    }
    return {
      resources: result?.resources ?? [],
      errors: result?.errors ?? [],
      isLoading: result?.isLoading ?? false,
      clustersData: [],
    };
  });
}

function mockPods(
  results: {
    installation: string;
    labelSelector?: string;
    fieldSelector?: string;
    pods?: Record<string, unknown>[];
    error?: Error;
  }[] = [],
  isLoading = false,
) {
  const { Pod } = jest.requireActual(
    '@giantswarm/backstage-plugin-kubernetes-react',
  );
  mockUsePodLists.mockReturnValue({
    isLoading,
    results: results.map(({ pods, error, ...request }) => ({
      request,
      pods: pods?.map(json => new Pod(json, request.installation)),
      error,
    })),
  });
}

function render(kserve: KServeInstallations = kserveInstallations()) {
  return renderHook(() => useKServeServingSource(kserve));
}

describe('useKServeServingSource', () => {
  beforeEach(() => {
    kserveInstallations.mockReset();
    mockUseResources.mockReset();
    mockUsePodLists.mockReset();
    kserveInstallations.mockReturnValue({
      installations: ['alpha'],
      isProbing: false,
      errors: [],
    });
    mockResources({});
    mockPods();
  });

  it('reads LLMInferenceServices, nodes and pods only on installations with KServe', () => {
    render();

    // Every resource read is scoped to the inventory's answer, and the
    // objects are the llm-d control plane's v1alpha2, no discovery.
    for (const call of mockUseResources.mock.calls) {
      expect(call[0]).toEqual(['alpha']);
    }
    const objectsCall = mockUseResources.mock.calls.find(
      call => call[1] === LLMInferenceService,
    );
    expect(objectsCall?.[3]).toMatchObject({ enableDiscovery: false });
    // One workload-pod list per KServe installation, by the controller's
    // label; no per-node lists yet.
    expect(mockUsePodLists.mock.calls[0][0]).toEqual([
      { installation: 'alpha', labelSelector: WORKLOAD_SELECTOR },
    ]);
  });

  it('contributes nothing on a fleet without KServe (no CRD anywhere)', () => {
    kserveInstallations.mockReturnValue({
      installations: [],
      isProbing: false,
      errors: [],
    });

    const { result } = render();

    expect(result.current).toEqual({
      isLoading: false,
      installations: [],
      backends: {},
      capabilities: {},
      gatewayHosts: {},
      unreachableInstallations: [],
      servedModels: [],
      gpuNodes: [],
      gpuCapacityUnavailable: {},
    });
    expect(mockUsePodLists.mock.calls[0][0]).toEqual([]);
  });

  it('maps mixed ready / not-ready / pending LLMInferenceServices', () => {
    mockResources({
      objects: {
        resources: [
          llmisvc('alpha', 'qwen3-14b', true),
          llmisvc('alpha', 'devstral', false),
          llmisvc('alpha', 'fresh', undefined, '2'),
        ],
      },
    });

    const { result } = render();

    expect(result.current.backends).toEqual({ alpha: 'kserve' });
    // Reading CRs offers the node inventory (the GPU panel) and no operations.
    expect(result.current.capabilities).toEqual({
      alpha: expect.objectContaining({
        nodeInventory: true,
        pull: false,
        load: false,
        delete: false,
        wire: false,
      }),
    });
    expect(
      result.current.servedModels.map(model => [
        model.name,
        model.readiness,
        model.gpuCount,
        model.node,
        model.nodeSource,
      ]),
    ).toEqual([
      ['qwen3-14b', 'ready', 1, 'gpu-node-1', 'spec'],
      ['devstral', 'notReady', 1, 'gpu-node-1', 'spec'],
      ['fresh', 'pending', 2, 'gpu-node-1', 'spec'],
    ]);
    expect(result.current.servedModels[1].readinessMessage).toBe(
      'Deployment does not have minimum availability.',
    );
    expect(result.current.servedModels[0].internalUrl).toBe(
      'https://models.example.test/kserve/qwen3-14b',
    );
  });

  it('places a served model on the node its workload pod runs on', () => {
    mockResources({
      objects: { resources: [llmisvc('alpha', 'qwen3-14b', true)] },
    });
    mockPods([
      {
        installation: 'alpha',
        labelSelector: WORKLOAD_SELECTOR,
        pods: [
          {
            apiVersion: 'v1',
            kind: 'Pod',
            metadata: {
              name: 'qwen3-14b-kserve-x',
              namespace: 'kserve',
              labels: {
                'app.kubernetes.io/part-of': 'llminferenceservice',
                'app.kubernetes.io/name': 'qwen3-14b',
                'kserve.io/component': 'workload',
              },
            },
            spec: { nodeName: 'gpu-node-2' },
            status: { phase: 'Running' },
          },
        ],
      },
    ]);

    const { result } = render();

    expect(result.current.servedModels[0].node).toBe('gpu-node-2');
    expect(result.current.servedModels[0].nodeSource).toBe('pod');
  });

  it('requests the pods of GPU nodes with schedulable GPUs and computes what they hold', () => {
    mockResources({
      nodes: {
        resources: [gpuNodeWithPlugin('alpha'), gpuNodeLabelsOnly('alpha')],
      },
    });
    mockPods([
      { installation: 'alpha', labelSelector: WORKLOAD_SELECTOR, pods: [] },
      {
        installation: 'alpha',
        fieldSelector: 'spec.nodeName=gpu-node-1',
        pods: [
          {
            apiVersion: 'v1',
            kind: 'Pod',
            metadata: { name: 'p', namespace: 'kserve' },
            spec: {
              nodeName: 'gpu-node-1',
              containers: [
                {
                  name: 'c',
                  resources: { requests: { 'nvidia.com/gpu': '1' } },
                },
              ],
            },
            status: { phase: 'Running' },
          },
        ],
      },
    ]);

    const { result } = render();

    // Only the node with an allocatable figure gets a per-node pod list.
    expect(mockUsePodLists.mock.calls.at(-1)?.[0]).toEqual([
      { installation: 'alpha', labelSelector: WORKLOAD_SELECTOR },
      { installation: 'alpha', fieldSelector: 'spec.nodeName=gpu-node-1' },
    ]);
    expect(result.current.gpuNodes).toEqual([
      expect.objectContaining({
        name: 'gpu-node-1',
        product: 'NVIDIA-GB10',
        memoryMiB: 122880,
        labeledCount: 1,
        capacity: 1,
        allocatable: 1,
        requested: 1,
      }),
      // Labels only: no device plugin, so nothing allocatable and nothing
      // requested — a valid state, not an error.
      expect.objectContaining({
        name: 'lab-node',
        product: 'NVIDIA-GB10',
        capacity: undefined,
        allocatable: undefined,
        requested: undefined,
      }),
    ]);
  });

  it('ignores nodes without any GPU evidence', () => {
    mockResources({ nodes: { resources: [node('alpha', 'worker-1')] } });

    const { result } = render();

    expect(result.current.gpuNodes).toEqual([]);
  });

  it('lists a node whose only accelerator is a non-NVIDIA resource, counted in that resource', () => {
    mockResources({
      nodes: {
        resources: [
          node('alpha', 'amd-node', {
            metadata: { name: 'amd-node' },
            status: {
              conditions: [{ type: 'Ready', status: 'True' }],
              capacity: { 'amd.com/gpu': '2' },
              allocatable: { 'amd.com/gpu': '2' },
            },
          }),
          node('alpha', 'worker-1'),
        ],
      },
    });

    const { result } = render();

    expect(result.current.gpuNodes).toEqual([
      expect.objectContaining({
        name: 'amd-node',
        resource: 'amd.com/gpu',
        capacity: 2,
        allocatable: 2,
      }),
    ]);
    // Its pods are listed for the requested figure, like an NVIDIA node's.
    expect(mockUsePodLists.mock.calls.at(-1)?.[0]).toContainEqual({
      installation: 'alpha',
      fieldSelector: 'spec.nodeName=amd-node',
    });
  });

  it("counts the resource the installation's discovery ConfigMap names — on nodes and on the served models — and lists nodes by it", () => {
    const fpgaModel = new LLMInferenceService(
      {
        apiVersion: 'serving.kserve.io/v1alpha2',
        kind: 'LLMInferenceService',
        metadata: { name: 'fpga-model', namespace: 'kserve', generation: 1 },
        spec: {
          model: { uri: 'hf://org/fpga-model', name: 'org/fpga-model' },
          template: {
            containers: [
              {
                name: 'main',
                resources: { requests: { 'xilinx.com/fpga': '2' } },
              },
            ],
          },
        },
      } as LLMInferenceServiceInterface,
      'alpha',
    );
    mockResources({
      configMaps: {
        resources: [discoveryConfigMap('alpha', 'xilinx.com/fpga')],
      },
      objects: { resources: [fpgaModel] },
      nodes: {
        resources: [
          node('alpha', 'fpga-node', {
            metadata: { name: 'fpga-node' },
            status: {
              conditions: [{ type: 'Ready', status: 'True' }],
              capacity: { 'xilinx.com/fpga': '4', cpu: '64' },
              allocatable: { 'xilinx.com/fpga': '3', cpu: '63' },
            },
          }),
          node('alpha', 'worker-1'),
        ],
      },
    });

    const { result } = render();

    // The discovery ConfigMap is read on the KServe installations only.
    expect(
      mockUseResources.mock.calls.find(call => call[1] === ConfigMap)?.[0],
    ).toEqual(['alpha']);
    expect(result.current.gpuNodes).toEqual([
      expect.objectContaining({
        name: 'fpga-node',
        resource: 'xilinx.com/fpga',
        capacity: 4,
        allocatable: 3,
      }),
    ]);
    expect(mockUsePodLists.mock.calls.at(-1)?.[0]).toContainEqual({
      installation: 'alpha',
      fieldSelector: 'spec.nodeName=fpga-node',
    });
    expect(result.current.servedModels[0].gpuCount).toBe(2);
    // No Gateway rendered there: nothing to resolve a client's route on.
    expect(result.current.gatewayHosts).toEqual({});
  });

  it("publishes the installation's models Gateway as its gatewayHosts", () => {
    mockResources({
      configMaps: {
        resources: [
          discoveryConfigMap(
            'alpha',
            'nvidia.com/gpu',
            'https://models.example.test',
          ),
        ],
      },
    });

    const { result } = render();

    expect(result.current.gatewayHosts).toEqual({
      alpha: ['models.example.test:443'],
    });
  });

  it('surfaces an installation whose probe failed as unreachable', () => {
    kserveInstallations.mockReturnValue({
      installations: ['alpha'],
      isProbing: false,
      errors: [{ installation: 'beta', error: new Error('HTTP 502') }],
    });

    const { result } = render();

    expect(result.current.unreachableInstallations).toEqual(['beta']);
    expect(result.current.installations).toEqual(['alpha']);
  });

  it('surfaces an installation whose LLMInferenceServices could not be listed', () => {
    kserveInstallations.mockReturnValue({
      installations: ['alpha', 'beta'],
      isProbing: false,
      errors: [],
    });
    mockResources({
      objects: {
        resources: [llmisvc('alpha', 'qwen3-14b', true)],
        errors: buildResourceErrors({ failed: ['beta'] }),
      },
    });

    const { result } = render();

    expect(result.current.unreachableInstallations).toEqual(['beta']);
  });

  it('drops an installation whose CRD vanished after the probe answered', () => {
    // The probe verdict is cached for minutes; a 404 on the list itself is
    // the earliest sign the llm-d control plane was uninstalled. Neither a
    // failure nor an empty section: the installation simply leaves the
    // Serving view.
    kserveInstallations.mockReturnValue({
      installations: ['alpha', 'beta'],
      isProbing: false,
      errors: [],
    });
    mockResources({
      objects: {
        resources: [llmisvc('alpha', 'qwen3-14b', true)],
        errors: buildResourceErrors({ notFound: ['beta'] }),
      },
      nodes: {
        resources: [gpuNodeWithPlugin('alpha'), gpuNodeWithPlugin('beta')],
      },
    });

    const { result } = render();

    expect(result.current.installations).toEqual(['alpha']);
    expect(result.current.backends).toEqual({ alpha: 'kserve' });
    expect(result.current.unreachableInstallations).toEqual([]);
    expect(result.current.gpuNodes.map(row => row.installation)).toEqual([
      'alpha',
    ]);
  });

  it('reports why GPU capacity is unavailable per installation, without hiding the models', () => {
    mockResources({
      objects: { resources: [llmisvc('alpha', 'qwen3-14b', true)] },
      nodes: {
        errors: [
          ...buildResourceErrors({ failed: ['alpha'] }),
          { cluster: 'beta', error: { name: 'Error' } },
        ],
      },
    });

    const { result } = render();

    expect(result.current.gpuCapacityUnavailable).toEqual({
      alpha: 'forbidden',
      beta: 'error',
    });
    expect(result.current.servedModels).toHaveLength(1);
    expect(result.current.unreachableInstallations).toEqual([]);
  });

  it('is loading while any layer is still in flight', () => {
    kserveInstallations.mockReturnValue({
      installations: [],
      isProbing: true,
      errors: [],
    });
    expect(render().result.current.isLoading).toBe(true);

    kserveInstallations.mockReturnValue({
      installations: ['alpha'],
      isProbing: false,
      errors: [],
    });
    mockResources({ objects: { isLoading: true } });
    expect(render().result.current.isLoading).toBe(true);

    mockResources({});
    mockPods([], true);
    expect(render().result.current.isLoading).toBe(true);
  });
});
