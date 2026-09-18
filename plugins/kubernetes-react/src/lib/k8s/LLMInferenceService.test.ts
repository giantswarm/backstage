import {
  deriveLLMInferenceServiceReadiness,
  LLMInferenceService,
  LLMInferenceServiceInterface,
} from './LLMInferenceService';

function make(
  overrides: Partial<LLMInferenceServiceInterface> = {},
): LLMInferenceService {
  const json = {
    apiVersion: 'serving.kserve.io/v1alpha2',
    kind: 'LLMInferenceService',
    metadata: { name: 'qwen3-14b', namespace: 'model-serving', generation: 2 },
    ...overrides,
  } as LLMInferenceServiceInterface;

  return new LLMInferenceService(json, 'installation-1');
}

const spec: LLMInferenceServiceInterface['spec'] = {
  model: { uri: 'hf://Qwen/Qwen3-14B', name: 'Qwen/Qwen3-14B' },
  replicas: 1,
  router: { route: {} },
  template: {
    nodeSelector: { 'kubernetes.io/hostname': 'gpu-node-1' },
    containers: [
      {
        name: 'main',
        args: ['--max-model-len=32768'],
        resources: {
          requests: { 'nvidia.com/gpu': '1', memory: '48Gi' },
          limits: { 'nvidia.com/gpu': '1', memory: '64Gi' },
        },
      },
    ],
  },
};

const readyStatus: LLMInferenceServiceInterface['status'] = {
  observedGeneration: 2,
  url: 'https://models.example.test/model-serving/qwen3-14b',
  addresses: [
    { url: 'https://models.example.test/model-serving/qwen3-14b' },
    {
      url: 'https://qwen3-14b-kserve-workload-svc.model-serving.svc.cluster.local:8000',
    },
  ],
  conditions: [
    { type: 'PresetsCombined', status: 'True' },
    { type: 'WorkloadsReady', status: 'True' },
    { type: 'RouterReady', status: 'True' },
    { type: 'Ready', status: 'True' },
  ],
};

describe('LLMInferenceService', () => {
  it('exposes the GVK the llm-d control plane serves', () => {
    expect(LLMInferenceService.getGVK()).toEqual({
      apiVersion: 'v1alpha2',
      group: 'serving.kserve.io',
      plural: 'llminferenceservices',
      isCore: false,
      supportedVersions: ['v1alpha2'],
    });
  });

  it('names the workload pods the way the controller labels them', () => {
    expect(LLMInferenceService.WORKLOAD_POD_SELECTOR).toBe(
      'app.kubernetes.io/part-of=llminferenceservice',
    );
    expect(LLMInferenceService.WORKLOAD_POD_LABELS.name).toBe(
      'app.kubernetes.io/name',
    );
    expect(LLMInferenceService.WORKLOAD_POD_LABELS.component).toBe(
      'kserve.io/component',
    );
  });

  describe('spec', () => {
    it('reads the model, the main container and the pinned node', () => {
      const object = make({ spec });

      expect(object.getModelUri()).toBe('hf://Qwen/Qwen3-14B');
      expect(object.getModelName()).toBe('Qwen/Qwen3-14B');
      expect(object.getReplicas()).toBe(1);
      expect(object.getMainContainer()?.args).toEqual([
        '--max-model-len=32768',
      ]);
      expect(object.getPinnedNode()).toBe('gpu-node-1');
    });

    it('prefers an explicit nodeName over the hostname selector', () => {
      const object = make({
        spec: {
          template: {
            nodeName: 'gpu-node-2',
            nodeSelector: { 'kubernetes.io/hostname': 'gpu-node-1' },
          },
        },
      });

      expect(object.getPinnedNode()).toBe('gpu-node-2');
    });

    it('sums the accelerator request over the template containers, under the resource asked for', () => {
      const object = make({
        spec: {
          template: {
            containers: [
              { name: 'main', resources: { requests: { 'amd.com/gpu': '2' } } },
              {
                name: 'sidecar',
                resources: { limits: { 'amd.com/gpu': '1' } },
              },
            ],
          },
        },
      });

      expect(object.getGpuRequest('amd.com/gpu')).toBe(3);
      expect(object.getGpuRequest()).toBeUndefined();
      expect(make({ spec }).getGpuRequest()).toBe(1);
    });

    it('reports no accelerator request when no container declares one', () => {
      expect(make({ spec: { template: {} } }).getGpuRequest()).toBeUndefined();
      expect(make().getGpuRequest()).toBeUndefined();
    });
  });

  describe('readiness', () => {
    it('is pending without any status', () => {
      expect(make().getReadiness()).toBe('pending');
    });

    it('is ready when the Ready condition is True for the current generation', () => {
      expect(make({ status: readyStatus }).getReadiness()).toBe('ready');
    });

    it('is pending when the status lags behind the spec generation', () => {
      expect(
        make({
          status: { ...readyStatus, observedGeneration: 1 },
        }).getReadiness(),
      ).toBe('pending');
    });

    it('is notReady for Ready=False and Ready=Unknown', () => {
      for (const status of ['False', 'Unknown']) {
        expect(
          make({
            status: {
              observedGeneration: 2,
              conditions: [{ type: 'Ready', status }],
            },
          }).getReadiness(),
        ).toBe('notReady');
      }
    });

    it('explains a non-ready state from the Ready condition first, then the first failing condition', () => {
      expect(
        make({
          status: {
            observedGeneration: 2,
            conditions: [
              {
                type: 'WorkloadsReady',
                status: 'False',
                reason: 'MainWorkloadNotReady',
                message: 'Deployment does not have minimum availability.',
              },
              {
                type: 'Ready',
                status: 'False',
                reason: 'WorkloadsNotReady',
                message: 'The workload is not ready.',
              },
            ],
          },
        }).getReadinessMessage(),
      ).toBe('The workload is not ready.');

      const fromComponent = make({
        status: {
          observedGeneration: 2,
          conditions: [
            { type: 'PresetsCombined', status: 'True' },
            {
              type: 'RouterReady',
              status: 'False',
              reason: 'HTTPRoutesNotReady',
              message: 'HTTPRoute not accepted by the gateway.',
            },
            { type: 'Ready', status: 'False' },
          ],
        },
      });
      expect(fromComponent.getReadinessMessage()).toBe(
        'HTTPRoute not accepted by the gateway.',
      );
      expect(fromComponent.getReadinessReason()).toBe('HTTPRoutesNotReady');
    });

    it('names the reason from the Ready condition when it carries one, and none while ready', () => {
      expect(
        make({
          status: {
            observedGeneration: 2,
            conditions: [
              { type: 'Ready', status: 'False', reason: 'WorkloadsNotReady' },
            ],
          },
        }).getReadinessReason(),
      ).toBe('WorkloadsNotReady');
      expect(
        make({ status: readyStatus }).getReadinessReason(),
      ).toBeUndefined();
      expect(make().getReadinessReason()).toBeUndefined();
    });

    it('derives readiness from raw list data the same way', () => {
      expect(
        deriveLLMInferenceServiceReadiness({
          apiVersion: 'serving.kserve.io/v1alpha2',
          kind: 'LLMInferenceService',
          metadata: { name: 'x', generation: 1 },
          status: readyStatus,
        }),
      ).toBe('ready');
    });
  });

  describe('endpoints', () => {
    it('names the workload Service the controller creates', () => {
      const object = make({ spec });
      expect(object.getWorkloadServiceName()).toBe(
        'qwen3-14b-kserve-workload-svc',
      );
      expect(object.getWorkloadServiceUrl()).toBe(
        'http://qwen3-14b-kserve-workload-svc.model-serving.svc.cluster.local:8000',
      );
    });

    it('serves at the published route, and at the workload Service before one is published', () => {
      expect(make({ spec, status: readyStatus }).getServedUrl()).toBe(
        'https://models.example.test/model-serving/qwen3-14b',
      );
      expect(make({ spec }).getServedUrl()).toBe(
        'http://qwen3-14b-kserve-workload-svc.model-serving.svc.cluster.local:8000',
      );
    });

    it('gives a published cluster-local address the http scheme the Service speaks', () => {
      expect(
        make({
          spec,
          status: {
            addresses: [
              {
                url: 'https://qwen3-14b-kserve-workload-svc.model-serving.svc.cluster.local/',
              },
            ],
          },
        }).getServedUrl(),
      ).toBe(
        'http://qwen3-14b-kserve-workload-svc.model-serving.svc.cluster.local',
      );
    });

    it('reports the route on the models Gateway as the external URL, and none for a cluster-local one', () => {
      expect(make({ spec, status: readyStatus }).getExternalUrl()).toBe(
        'https://models.example.test/model-serving/qwen3-14b',
      );
      expect(
        make({
          spec,
          status: {
            url: 'https://qwen3-14b-kserve-workload-svc.model-serving.svc.cluster.local',
          },
        }).getExternalUrl(),
      ).toBeUndefined();
      expect(make({ spec }).getExternalUrl()).toBeUndefined();
    });

    it('lists every hostname the model answers on, without duplicates', () => {
      expect(make({ spec, status: readyStatus }).getEndpointHosts()).toEqual([
        'qwen3-14b-kserve-workload-svc.model-serving.svc.cluster.local',
        'qwen3-14b-kserve-workload-svc.model-serving.svc',
        'qwen3-14b-kserve-workload-svc.model-serving',
        'models.example.test',
      ]);
    });

    it('derives the Service DNS names even before a status exists', () => {
      expect(make({ spec }).getEndpointHosts()).toEqual([
        'qwen3-14b-kserve-workload-svc.model-serving.svc.cluster.local',
        'qwen3-14b-kserve-workload-svc.model-serving.svc',
        'qwen3-14b-kserve-workload-svc.model-serving',
      ]);
    });
  });
});
