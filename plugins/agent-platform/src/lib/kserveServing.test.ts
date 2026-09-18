import {
  LLMInferenceService,
  Node,
  Pod,
  type LLMInferenceServiceInterface,
  type NodeInterface,
  type PodInterface,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  acceleratorResourceOf,
  findWorkloadPod,
  isAcceleratorNode,
  LLMISVC_POLL_ACTIVE_MS,
  LLMISVC_POLL_IDLE_MS,
  llmInferenceServiceRefetchInterval,
  toGpuNode,
  toServedModel,
} from './kserveServing';

const WORKLOAD_LABELS = {
  'app.kubernetes.io/part-of': 'llminferenceservice',
  'app.kubernetes.io/name': 'qwen3-14b',
  'kserve.io/component': 'workload',
};

/** An LLMInferenceService as model-manager composes it from a preset. */
function llmisvc(
  overrides: Partial<LLMInferenceServiceInterface> = {},
  installation = 'alpha',
) {
  return new LLMInferenceService(
    {
      apiVersion: 'serving.kserve.io/v1alpha2',
      kind: 'LLMInferenceService',
      metadata: {
        name: 'qwen3-14b',
        namespace: 'kserve',
        generation: 1,
        labels: {
          'app.kubernetes.io/managed-by': 'model-manager',
          'agent-platform.giantswarm.io/preset': 'qwen3-14b',
        },
      },
      spec: {
        model: { uri: 'hf://Qwen/Qwen3-14B', name: 'Qwen/Qwen3-14B' },
        replicas: 1,
        router: { route: {} },
        template: {
          nodeSelector: { 'kubernetes.io/hostname': 'gpu-node-1' },
          containers: [
            {
              name: 'main',
              resources: { requests: { 'nvidia.com/gpu': '1' } },
            },
          ],
        },
      },
      ...overrides,
    } as LLMInferenceServiceInterface,
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
        name: 'qwen3-14b-kserve-abc',
        namespace: 'kserve',
        labels: labels ?? WORKLOAD_LABELS,
      },
      spec: {
        nodeName: 'gpu-node-2',
        containers: [
          {
            name: 'main',
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

const ROUTE = 'https://models.example.test/kserve/qwen3-14b';

describe('toServedModel', () => {
  it('maps the spec and status into the backend-agnostic shape, named like model-manager names it', () => {
    const served = toServedModel(
      llmisvc({
        status: {
          observedGeneration: 1,
          url: ROUTE,
          addresses: [{ url: ROUTE }],
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
      // The name the model is served under — model-manager's `model.name`.
      modelSource: 'Qwen/Qwen3-14B',
      readiness: 'ready',
      gpuCount: 1,
      // The route on the models Gateway is where clients reach it, in and
      // outside the cluster.
      internalUrl: ROUTE,
      externalUrl: ROUTE,
      preset: 'qwen3-14b',
    });
    // The well-known template's runtime: nothing to name per model.
    expect(served.runtime).toBeUndefined();
    expect(served.endpointHosts).toEqual(
      expect.arrayContaining([
        'qwen3-14b-kserve-workload-svc.kserve.svc.cluster.local',
        'models.example.test',
      ]),
    );
  });

  it('serves at the workload Service until the router has published a route', () => {
    const served = toServedModel(llmisvc());

    expect(served.internalUrl).toBe(
      'http://qwen3-14b-kserve-workload-svc.kserve.svc.cluster.local:8000',
    );
    expect(served.externalUrl).toBeUndefined();
    expect(served.readiness).toBe('pending');
  });

  it("counts accelerators under the installation's resource name", () => {
    const amd = llmisvc({
      spec: {
        model: { uri: 'hf://x', name: 'x' },
        template: {
          containers: [
            { name: 'main', resources: { requests: { 'amd.com/gpu': '2' } } },
          ],
        },
      },
    });

    expect(toServedModel(amd, [], 'amd.com/gpu').gpuCount).toBe(2);
    expect(toServedModel(amd).gpuCount).toBeUndefined();
  });

  it('takes the node from the workload pod when there is one', () => {
    const served = toServedModel(llmisvc(), [pod()]);

    expect(served.node).toBe('gpu-node-2');
    expect(served.nodeSource).toBe('pod');
  });

  it('falls back to the declared node pin without a pod', () => {
    const served = toServedModel(llmisvc(), []);

    expect(served.node).toBe('gpu-node-1');
    expect(served.nodeSource).toBe('spec');
  });

  it('has no node when neither a pod nor a pin exists', () => {
    const served = toServedModel(
      llmisvc({ spec: { model: { uri: 'pvc://m/x', name: 'x' } } }),
    );

    expect(served.node).toBeUndefined();
    expect(served.nodeSource).toBeUndefined();
    expect(served.gpuCount).toBeUndefined();
    expect(served.modelSource).toBe('x');
  });

  it('carries the failure explanation for a not-ready model, the reason as its word', () => {
    const served = toServedModel(
      llmisvc({
        status: {
          observedGeneration: 1,
          conditions: [
            {
              type: 'Ready',
              status: 'False',
              reason: 'WorkloadsNotReady',
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
    expect(served.readinessReason).toBe('WorkloadsNotReady');
  });

  it('says the reason once: a message that starts with it leaves the text as the explanation', () => {
    const served = toServedModel(
      llmisvc({
        status: {
          observedGeneration: 1,
          conditions: [
            {
              type: 'Ready',
              status: 'False',
              reason: 'HTTPRoutesNotReady',
              message: 'HTTPRoutesNotReady: route not accepted by the gateway',
            },
          ],
        },
      }),
    );

    expect(served.readiness).toBe('notReady');
    expect(served.readinessReason).toBe('HTTPRoutesNotReady');
    expect(served.readinessMessage).toBe('route not accepted by the gateway');
  });

  it('reads a waiting workload pod as Pending with the pod’s reason, whatever the conditions say', () => {
    const notReady = llmisvc({
      status: {
        observedGeneration: 1,
        conditions: [
          {
            type: 'Ready',
            status: 'False',
            reason: 'WorkloadsNotReady',
            message: 'Deployment does not have minimum availability.',
          },
        ],
      },
    });
    const unschedulable = pod({
      spec: { nodeName: undefined, containers: [] },
      status: {
        phase: 'Pending',
        conditions: [
          {
            type: 'PodScheduled',
            status: 'False',
            reason: 'Unschedulable',
            message: '0/3 nodes are available: 3 Insufficient nvidia.com/gpu.',
          },
        ],
      },
    });
    const pulling = pod({
      status: {
        phase: 'Pending',
        conditions: [{ type: 'PodScheduled', status: 'True' }],
        containerStatuses: [
          {
            name: 'main',
            state: {
              waiting: {
                reason: 'ImagePullBackOff',
                message: 'Back-off pulling image "llm-d-cuda:v0.8.0"',
              },
            },
          },
        ],
      },
    });

    expect(toServedModel(notReady, [unschedulable])).toMatchObject({
      readiness: 'pending',
      readinessReason: 'Unschedulable',
      readinessMessage:
        '0/3 nodes are available: 3 Insufficient nvidia.com/gpu.',
      // No pod on a node yet: the declared pin is the placement.
      node: 'gpu-node-1',
      nodeSource: 'spec',
    });
    expect(toServedModel(notReady, [pulling])).toMatchObject({
      readiness: 'pending',
      readinessReason: 'ImagePullBackOff',
      readinessMessage: 'Back-off pulling image "llm-d-cuda:v0.8.0"',
      node: 'gpu-node-2',
      nodeSource: 'pod',
    });
    // A Running pod says the model is somewhere: the conditions stand.
    expect(toServedModel(notReady, [pod()])).toMatchObject({
      readiness: 'notReady',
      readinessReason: 'WorkloadsNotReady',
      readinessMessage: 'Deployment does not have minimum availability.',
    });
    // A ready object with a pending sibling (a rollout) stays ready.
    expect(
      toServedModel(
        llmisvc({
          status: {
            observedGeneration: 1,
            conditions: [{ type: 'Ready', status: 'True' }],
          },
        }),
        [unschedulable],
      ),
    ).toMatchObject({ readiness: 'ready' });
  });

  it('reads an LLMInferenceService being deleted as Stopping', () => {
    const served = toServedModel(
      llmisvc({
        metadata: {
          name: 'qwen3-14b',
          namespace: 'kserve',
          generation: 1,
          deletionTimestamp: '2026-09-16T16:11:33Z',
        },
        status: {
          observedGeneration: 1,
          conditions: [
            { type: 'Ready', status: 'False', reason: 'WorkloadsNotReady' },
          ],
        },
      }),
    );

    expect(served.readiness).toBe('terminating');
    expect(served.readinessReason).toBeUndefined();
    expect(served.readinessMessage).toBe(
      'LLMInferenceService qwen3-14b is being deleted.',
    );
  });

  it('leaves the preset unset on an object nothing composed from one', () => {
    const served = toServedModel(
      llmisvc({
        metadata: { name: 'qwen3-14b', namespace: 'kserve', generation: 1 },
      }),
    );

    expect(served.preset).toBeUndefined();
  });
});

describe('findWorkloadPod', () => {
  it('matches on installation, namespace and the controller’s labels, skipping finished pods', () => {
    const object = llmisvc();
    const finished = pod({ status: { phase: 'Succeeded' } });
    const otherInstallation = pod({}, 'beta');
    const otherNamespace = pod({
      metadata: { name: 'x', namespace: 'other', labels: WORKLOAD_LABELS },
    });
    const otherObject = pod({
      labels: { ...WORKLOAD_LABELS, 'app.kubernetes.io/name': 'llama' },
    });
    // The same name on a pod of another kind (a Deployment named like the
    // model) is not the workload.
    const otherKind = pod({
      labels: { 'app.kubernetes.io/name': 'qwen3-14b' },
    });
    const pending = pod({ status: { phase: 'Pending' } });
    const running = pod();

    expect(
      findWorkloadPod(object, [
        finished,
        otherInstallation,
        otherNamespace,
        otherObject,
        otherKind,
        pending,
        running,
      ]),
    ).toBe(running);
    expect(findWorkloadPod(object, [pending])).toBe(pending);
    expect(findWorkloadPod(object, [finished])).toBeUndefined();
  });
});

describe('isAcceleratorNode', () => {
  it('recognises device-plugin capacity or any discovery label', () => {
    expect(
      isAcceleratorNode(
        node({ status: { capacity: { 'nvidia.com/gpu': '1' } } }),
      ),
    ).toBe(true);
    expect(
      isAcceleratorNode(
        node({
          metadata: { name: 'n', labels: { 'nvidia.com/gpu.present': 'true' } },
        }),
      ),
    ).toBe(true);
    expect(
      isAcceleratorNode(
        node({
          metadata: {
            name: 'n',
            labels: { 'nvidia.com/gpu.product': 'NVIDIA-GB10' },
          },
        }),
      ),
    ).toBe(true);
    expect(
      isAcceleratorNode(
        node({
          metadata: { name: 'n', labels: { 'nvidia.com/gpu.count': '2' } },
        }),
      ),
    ).toBe(true);
  });

  it('recognises the other accelerator resources a device plugin can advertise', () => {
    for (const resource of [
      'amd.com/gpu',
      'intel.com/gpu',
      'google.com/tpu',
      'habana.ai/gaudi',
      'rockchip.com/npu',
    ]) {
      expect(
        isAcceleratorNode(node({ status: { capacity: { [resource]: '1' } } })),
      ).toBe(true);
    }
  });

  it("recognises the installation's own resource name only when told it", () => {
    const fpga = node({ status: { capacity: { 'xilinx.com/fpga': '2' } } });

    expect(isAcceleratorNode(fpga)).toBe(false);
    expect(isAcceleratorNode(fpga, 'xilinx.com/fpga')).toBe(true);
  });

  it('rejects a plain node — CPU, memory and pods are not accelerators', () => {
    expect(isAcceleratorNode(node())).toBe(false);
    expect(
      isAcceleratorNode(
        node({
          status: {
            capacity: { cpu: '20', memory: '64Gi', pods: '110' },
          },
        }),
        'nvidia.com/gpu',
      ),
    ).toBe(false);
  });
});

describe('acceleratorResourceOf', () => {
  it("prefers the installation's resource name, then the known resources, then a vendor NPU", () => {
    const both = node({
      status: {
        capacity: { 'nvidia.com/gpu': '1', 'xilinx.com/fpga': '2' },
      },
    });
    expect(acceleratorResourceOf(both, 'xilinx.com/fpga')).toBe(
      'xilinx.com/fpga',
    );
    expect(acceleratorResourceOf(both)).toBe('nvidia.com/gpu');
    expect(
      acceleratorResourceOf(
        node({ status: { capacity: { cpu: '8', 'rockchip.com/npu': '1' } } }),
      ),
    ).toBe('rockchip.com/npu');
    expect(acceleratorResourceOf(node())).toBeUndefined();
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
      resource: 'nvidia.com/gpu',
      capacity: 1,
      allocatable: 1,
      requested: 1,
      schedulable: true,
    });
  });

  it('counts a non-NVIDIA accelerator in its own resource, requests included', () => {
    const amd = node({
      metadata: { name: 'amd-node' },
      status: {
        conditions: [{ type: 'Ready', status: 'True' }],
        capacity: { 'amd.com/gpu': '2', cpu: '32' },
        allocatable: { 'amd.com/gpu': '2', cpu: '31' },
      },
    });
    const onNode = pod({
      spec: {
        nodeName: 'amd-node',
        containers: [
          { name: 'a', resources: { requests: { 'amd.com/gpu': '1' } } },
        ],
      },
    });

    expect(toGpuNode(amd, [onNode])).toMatchObject({
      name: 'amd-node',
      product: undefined,
      resource: 'amd.com/gpu',
      capacity: 2,
      allocatable: 2,
      requested: 1,
    });
  });

  it("counts the installation's own resource when the discovery config names one", () => {
    const fpga = node({
      metadata: { name: 'fpga-node' },
      status: {
        conditions: [{ type: 'Ready', status: 'True' }],
        capacity: { 'xilinx.com/fpga': '4' },
        allocatable: { 'xilinx.com/fpga': '3' },
      },
    });

    expect(toGpuNode(fpga, [], 'xilinx.com/fpga')).toMatchObject({
      resource: 'xilinx.com/fpga',
      capacity: 4,
      allocatable: 3,
      requested: 0,
    });
    // Without the name the resource is unknown to the portal: no figures.
    expect(toGpuNode(fpga, [])).toMatchObject({
      resource: undefined,
      capacity: undefined,
      allocatable: undefined,
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
      schedulable: true,
    });
  });

  it('reports zero requested when pods were read but none use a GPU', () => {
    expect(toGpuNode(labelled, []).requested).toBe(0);
  });
});

describe('toGpuNode memory', () => {
  it('reports the allocatable memory in bytes and the schedulability', () => {
    const gpuNode = toGpuNode(
      new Node(
        {
          apiVersion: 'v1',
          kind: 'Node',
          metadata: { name: 'spark' },
          spec: { unschedulable: true },
          status: {
            conditions: [{ type: 'Ready', status: 'True' }],
            allocatable: { memory: '90251888Ki' },
          },
        } as NodeInterface,
        'alpha',
      ),
    );

    expect(gpuNode.memoryAllocatableBytes).toBe(90251888 * 1024);
    expect(gpuNode.schedulable).toBe(false);
  });
});

describe('llmInferenceServiceRefetchInterval', () => {
  const ready: LLMInferenceServiceInterface = {
    apiVersion: 'serving.kserve.io/v1alpha2',
    kind: 'LLMInferenceService',
    metadata: { name: 'a', generation: 1 },
    status: {
      observedGeneration: 1,
      conditions: [{ type: 'Ready', status: 'True' }],
    },
  };
  const pending: LLMInferenceServiceInterface = {
    apiVersion: 'serving.kserve.io/v1alpha2',
    kind: 'LLMInferenceService',
    metadata: { name: 'b' },
  };

  it('polls fast while anything is not ready, slowly once everything is', () => {
    expect(
      llmInferenceServiceRefetchInterval({
        state: { data: [ready, pending] },
      }),
    ).toBe(LLMISVC_POLL_ACTIVE_MS);
    expect(
      llmInferenceServiceRefetchInterval({ state: { data: [ready] } }),
    ).toBe(LLMISVC_POLL_IDLE_MS);
    expect(llmInferenceServiceRefetchInterval({ state: {} })).toBe(
      LLMISVC_POLL_IDLE_MS,
    );
  });
});
