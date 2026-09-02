import { renderHook } from '@testing-library/react';
import {
  InferenceService,
  Node,
  type InferenceServiceInterface,
  type NodeInterface,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { buildResourceErrors } from '../resourceErrorFixtures';
import { useKServeServingSource } from './useKServeServingSource';

// The three fetch layers are mocked so each fixture drives the merge logic
// directly: which installations have KServe, what their InferenceServices,
// nodes and pods say, and how failures at each layer surface.
const mockUseKServeInstallations = jest.fn();
const mockUseResources = jest.fn();
const mockUsePodLists = jest.fn();

jest.mock('../../hooks/useKServeInstallations', () => ({
  useKServeInstallations: (...args: unknown[]) =>
    mockUseKServeInstallations(...args),
}));

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

function isvc(
  installation: string,
  name: string,
  ready: boolean | undefined,
  gpus = '1',
): InferenceService {
  const status: InferenceServiceInterface['status'] =
    ready === undefined
      ? undefined
      : {
          observedGeneration: 1,
          address: {
            url: `http://${name}-predictor.kserve.svc.cluster.local`,
          },
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
  return new InferenceService(
    {
      apiVersion: 'serving.kserve.io/v1beta1',
      kind: 'InferenceService',
      metadata: { name, namespace: 'kserve', generation: 1 },
      spec: {
        predictor: {
          nodeSelector: { 'kubernetes.io/hostname': 'gpu-node-1' },
          model: {
            runtime: 'kserve-vllm',
            storageUri: `hf://org/${name}`,
            resources: { requests: { 'nvidia.com/gpu': gpus } },
          },
        },
      },
      status,
    } as InferenceServiceInterface,
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

type ResourcesResult = {
  resources?: unknown[];
  errors?: ReturnType<typeof buildResourceErrors>;
  isLoading?: boolean;
};

/** Route `useResources` calls by resource class. */
function mockResources(byClass: {
  inferenceServices?: ResourcesResult;
  nodes?: ResourcesResult;
}) {
  mockUseResources.mockImplementation((_clusters, ResourceClass) => {
    const result =
      ResourceClass === InferenceService
        ? byClass.inferenceServices
        : byClass.nodes;
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

function render(reachable = ['alpha', 'beta']) {
  return renderHook(() => useKServeServingSource(reachable));
}

describe('useKServeServingSource', () => {
  beforeEach(() => {
    mockUseKServeInstallations.mockReset();
    mockUseResources.mockReset();
    mockUsePodLists.mockReset();
    mockUseKServeInstallations.mockReturnValue({
      installations: ['alpha'],
      isProbing: false,
      errors: [],
    });
    mockResources({});
    mockPods();
  });

  it('reads InferenceServices, nodes and pods only on installations with KServe', () => {
    render(['alpha', 'beta']);

    expect(mockUseKServeInstallations).toHaveBeenCalledWith(['alpha', 'beta']);
    // Both resource reads are scoped to the probe's answer, not the input.
    for (const call of mockUseResources.mock.calls) {
      expect(call[0]).toEqual(['alpha']);
    }
    // One predictor-pod list per KServe installation, no per-node lists yet.
    expect(mockUsePodLists.mock.calls[0][0]).toEqual([
      {
        installation: 'alpha',
        labelSelector: 'serving.kserve.io/inferenceservice',
      },
    ]);
  });

  it('contributes nothing on a fleet without KServe (no CRD anywhere)', () => {
    mockUseKServeInstallations.mockReturnValue({
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
      unreachableInstallations: [],
      servedModels: [],
      gpuNodes: [],
      gpuCapacityUnavailable: {},
    });
    expect(mockUsePodLists.mock.calls[0][0]).toEqual([]);
  });

  it('maps mixed ready / not-ready / pending InferenceServices', () => {
    mockResources({
      inferenceServices: {
        resources: [
          isvc('alpha', 'qwen3-14b', true),
          isvc('alpha', 'devstral', false),
          isvc('alpha', 'fresh', undefined, '2'),
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
  });

  it('places a served model on the node its predictor pod runs on', () => {
    mockResources({
      inferenceServices: { resources: [isvc('alpha', 'qwen3-14b', true)] },
    });
    mockPods([
      {
        installation: 'alpha',
        labelSelector: 'serving.kserve.io/inferenceservice',
        pods: [
          {
            apiVersion: 'v1',
            kind: 'Pod',
            metadata: {
              name: 'qwen3-14b-predictor-x',
              namespace: 'kserve',
              labels: { 'serving.kserve.io/inferenceservice': 'qwen3-14b' },
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
      {
        installation: 'alpha',
        labelSelector: 'serving.kserve.io/inferenceservice',
        pods: [],
      },
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
      {
        installation: 'alpha',
        labelSelector: 'serving.kserve.io/inferenceservice',
      },
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

  it('surfaces an installation whose probe failed as unreachable', () => {
    mockUseKServeInstallations.mockReturnValue({
      installations: ['alpha'],
      isProbing: false,
      errors: [{ installation: 'beta', error: new Error('HTTP 502') }],
    });

    const { result } = render();

    expect(result.current.unreachableInstallations).toEqual(['beta']);
    expect(result.current.installations).toEqual(['alpha']);
  });

  it('surfaces an installation whose InferenceServices could not be listed', () => {
    mockUseKServeInstallations.mockReturnValue({
      installations: ['alpha', 'beta'],
      isProbing: false,
      errors: [],
    });
    mockResources({
      inferenceServices: {
        resources: [isvc('alpha', 'qwen3-14b', true)],
        errors: buildResourceErrors({ failed: ['beta'] }),
      },
    });

    const { result } = render();

    expect(result.current.unreachableInstallations).toEqual(['beta']);
  });

  it('drops an installation whose CRD vanished after the probe answered', () => {
    // The probe verdict is cached for minutes; a 404 on the list itself is
    // the earliest sign KServe was uninstalled. Neither a failure nor an empty
    // section: the installation simply leaves the Serving view.
    mockUseKServeInstallations.mockReturnValue({
      installations: ['alpha', 'beta'],
      isProbing: false,
      errors: [],
    });
    mockResources({
      inferenceServices: {
        resources: [isvc('alpha', 'qwen3-14b', true)],
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
      inferenceServices: { resources: [isvc('alpha', 'qwen3-14b', true)] },
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
    mockUseKServeInstallations.mockReturnValue({
      installations: [],
      isProbing: true,
      errors: [],
    });
    expect(render().result.current.isLoading).toBe(true);

    mockUseKServeInstallations.mockReturnValue({
      installations: ['alpha'],
      isProbing: false,
      errors: [],
    });
    mockResources({ inferenceServices: { isLoading: true } });
    expect(render().result.current.isLoading).toBe(true);

    mockResources({});
    mockPods([], true);
    expect(render().result.current.isLoading).toBe(true);
  });
});
