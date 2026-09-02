import {
  InferenceService,
  Node,
  Pod,
  type InferenceServiceInterface,
  type NodeInterface,
  type PodInterface,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  findPredictorPod,
  isGpuNode,
  KSERVE_INFERENCESERVICE_LABEL,
  toGpuNode,
  toServedModel,
} from './kserveServing';

function isvc(
  overrides: Partial<InferenceServiceInterface> = {},
  installation = 'alpha',
) {
  return new InferenceService(
    {
      apiVersion: 'serving.kserve.io/v1beta1',
      kind: 'InferenceService',
      metadata: { name: 'qwen3-14b', namespace: 'kserve', generation: 1 },
      spec: {
        predictor: {
          nodeSelector: { 'kubernetes.io/hostname': 'gpu-node-1' },
          model: {
            modelFormat: { name: 'vLLM' },
            runtime: 'kserve-vllm',
            storageUri: 'hf://Qwen/Qwen3-14B',
            resources: { requests: { 'nvidia.com/gpu': '1' } },
          },
        },
      },
      ...overrides,
    } as InferenceServiceInterface,
    installation,
  );
}

function pod(
  overrides: Partial<PodInterface> & { labels?: Record<string, string> } = {},
  installation = 'alpha',
) {
  const { labels, ...rest } = overrides;
  return new Pod(
    {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: {
        name: 'qwen3-14b-predictor-abc',
        namespace: 'kserve',
        labels: labels ?? { [KSERVE_INFERENCESERVICE_LABEL]: 'qwen3-14b' },
      },
      spec: {
        nodeName: 'gpu-node-2',
        containers: [
          {
            name: 'kserve-container',
            resources: { requests: { 'nvidia.com/gpu': '1' } },
          },
        ],
      },
      status: { phase: 'Running' },
      ...rest,
    } as PodInterface,
    installation,
  );
}

function node(overrides: Partial<NodeInterface> = {}, installation = 'alpha') {
  return new Node(
    {
      apiVersion: 'v1',
      kind: 'Node',
      metadata: { name: 'gpu-node-1' },
      status: { conditions: [{ type: 'Ready', status: 'True' }] },
      ...overrides,
    } as NodeInterface,
    installation,
  );
}

describe('toServedModel', () => {
  it('maps the spec and status into the backend-agnostic shape', () => {
    const served = toServedModel(
      isvc({
        status: {
          observedGeneration: 1,
          url: 'https://qwen3-14b.models.example.test',
          address: {
            url: 'http://qwen3-14b-predictor.kserve.svc.cluster.local',
          },
          conditions: [{ type: 'Ready', status: 'True' }],
        },
      }),
    );

    expect(served).toMatchObject({
      id: 'alpha/kserve/kserve/qwen3-14b',
      installation: 'alpha',
      backend: 'kserve',
      name: 'qwen3-14b',
      namespace: 'kserve',
      modelSource: 'hf://Qwen/Qwen3-14B',
      runtime: 'kserve-vllm',
      readiness: 'ready',
      gpuCount: 1,
      internalUrl: 'http://qwen3-14b-predictor.kserve.svc.cluster.local',
      externalUrl: 'https://qwen3-14b.models.example.test',
    });
    expect(served.endpointHosts).toContain(
      'qwen3-14b-predictor.kserve.svc.cluster.local',
    );
  });

  it('takes the node from the predictor pod when there is one', () => {
    const served = toServedModel(isvc(), [pod()]);

    expect(served.node).toBe('gpu-node-2');
    expect(served.nodeSource).toBe('pod');
  });

  it('falls back to the declared node pin without a pod', () => {
    const served = toServedModel(isvc(), []);

    expect(served.node).toBe('gpu-node-1');
    expect(served.nodeSource).toBe('spec');
  });

  it('has no node when neither a pod nor a pin exists', () => {
    const served = toServedModel(
      isvc({ spec: { predictor: { model: { storageUri: 'pvc://m' } } } }),
    );

    expect(served.node).toBeUndefined();
    expect(served.nodeSource).toBeUndefined();
    expect(served.gpuCount).toBeUndefined();
  });

  it('carries the failure explanation for a not-ready model', () => {
    const served = toServedModel(
      isvc({
        status: {
          observedGeneration: 1,
          conditions: [
            {
              type: 'Ready',
              status: 'False',
              reason: 'RevisionFailed',
              message: 'Deployment does not have minimum availability.',
            },
          ],
        },
      }),
    );

    expect(served.readiness).toBe('notReady');
    expect(served.readinessMessage).toBe(
      'Deployment does not have minimum availability.',
    );
  });

  it('falls back to the model format when no runtime is named', () => {
    const served = toServedModel(
      isvc({
        spec: {
          predictor: {
            model: {
              modelFormat: { name: 'huggingface' },
              storageUri: 'hf://x',
            },
          },
        },
      }),
    );

    expect(served.runtime).toBe('huggingface');
  });
});

describe('findPredictorPod', () => {
  it('matches on installation, namespace and the KServe label, skipping finished pods', () => {
    const service = isvc();
    const finished = pod({ status: { phase: 'Succeeded' } });
    const otherInstallation = pod({}, 'beta');
    const otherNamespace = pod({
      metadata: {
        name: 'x',
        namespace: 'other',
        labels: { [KSERVE_INFERENCESERVICE_LABEL]: 'qwen3-14b' },
      },
    });
    const otherService = pod({
      labels: { [KSERVE_INFERENCESERVICE_LABEL]: 'llama' },
    });
    const pending = pod({ status: { phase: 'Pending' } });
    const running = pod();

    expect(
      findPredictorPod(service, [
        finished,
        otherInstallation,
        otherNamespace,
        otherService,
        pending,
        running,
      ]),
    ).toBe(running);
    expect(findPredictorPod(service, [pending])).toBe(pending);
    expect(findPredictorPod(service, [finished])).toBeUndefined();
  });
});

describe('isGpuNode', () => {
  it('recognises device-plugin capacity or any discovery label', () => {
    expect(
      isGpuNode(node({ status: { capacity: { 'nvidia.com/gpu': '1' } } })),
    ).toBe(true);
    expect(
      isGpuNode(
        node({
          metadata: { name: 'n', labels: { 'nvidia.com/gpu.present': 'true' } },
        }),
      ),
    ).toBe(true);
    expect(
      isGpuNode(
        node({
          metadata: {
            name: 'n',
            labels: { 'nvidia.com/gpu.product': 'NVIDIA-GB10' },
          },
        }),
      ),
    ).toBe(true);
    expect(
      isGpuNode(
        node({
          metadata: { name: 'n', labels: { 'nvidia.com/gpu.count': '2' } },
        }),
      ),
    ).toBe(true);
  });

  it('rejects a plain node', () => {
    expect(isGpuNode(node())).toBe(false);
  });
});

describe('toGpuNode', () => {
  const labelled = node({
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
      capacity: { 'nvidia.com/gpu': '1', cpu: '20' },
      allocatable: { 'nvidia.com/gpu': '1', cpu: '19' },
    },
  });

  it('reads labels, device-plugin figures and sums pod requests on the node', () => {
    const onNode = pod({
      spec: {
        nodeName: 'gpu-node-1',
        containers: [
          { name: 'a', resources: { requests: { 'nvidia.com/gpu': '1' } } },
        ],
      },
    });
    const elsewhere = pod({
      spec: {
        nodeName: 'gpu-node-2',
        containers: [
          { name: 'a', resources: { requests: { 'nvidia.com/gpu': '1' } } },
        ],
      },
    });
    const finished = pod({
      spec: {
        nodeName: 'gpu-node-1',
        containers: [
          { name: 'a', resources: { requests: { 'nvidia.com/gpu': '1' } } },
        ],
      },
      status: { phase: 'Succeeded' },
    });
    const noGpu = pod({
      spec: {
        nodeName: 'gpu-node-1',
        containers: [{ name: 'a', resources: { requests: { cpu: '1' } } }],
      },
    });

    expect(toGpuNode(labelled, [onNode, elsewhere, finished, noGpu])).toEqual({
      id: 'alpha/gpu-node-1',
      installation: 'alpha',
      name: 'gpu-node-1',
      ready: true,
      product: 'NVIDIA-GB10',
      memoryMiB: 122880,
      labeledCount: 1,
      capacity: 1,
      allocatable: 1,
      requested: 1,
    });
  });

  it('leaves device-plugin figures and requests unknown when absent', () => {
    const labelsOnly = node({
      metadata: {
        name: 'gpu-node-1',
        labels: { 'nvidia.com/gpu.product': 'NVIDIA-GB10' },
      },
    });

    expect(toGpuNode(labelsOnly)).toEqual({
      id: 'alpha/gpu-node-1',
      installation: 'alpha',
      name: 'gpu-node-1',
      ready: true,
      product: 'NVIDIA-GB10',
      memoryMiB: undefined,
      labeledCount: undefined,
      capacity: undefined,
      allocatable: undefined,
      requested: undefined,
    });
  });

  it('reports zero requested when pods were read but none use a GPU', () => {
    expect(toGpuNode(labelled, []).requested).toBe(0);
  });
});
