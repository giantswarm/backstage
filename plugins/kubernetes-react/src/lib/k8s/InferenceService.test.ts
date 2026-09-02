import {
  deriveInferenceServiceReadiness,
  InferenceService,
  InferenceServiceInterface,
  urlHostname,
} from './InferenceService';

function makeInferenceService(
  overrides: Partial<InferenceServiceInterface> = {},
): InferenceService {
  const json = {
    apiVersion: 'serving.kserve.io/v1beta1',
    kind: 'InferenceService',
    metadata: { name: 'qwen3-14b', namespace: 'kserve', generation: 2 },
    ...overrides,
  } as InferenceServiceInterface;

  return new InferenceService(json, 'installation-1');
}

const readyStatus: InferenceServiceInterface['status'] = {
  observedGeneration: 2,
  url: 'https://qwen3-14b.models.example.test',
  address: { url: 'http://qwen3-14b-predictor.kserve.svc.cluster.local' },
  components: {
    predictor: {
      url: 'https://qwen3-14b-predictor.models.example.test',
      address: { url: 'http://qwen3-14b-predictor.kserve.svc.cluster.local' },
    },
  },
  conditions: [
    { type: 'PredictorReady', status: 'True' },
    { type: 'Ready', status: 'True' },
  ],
};

describe('InferenceService', () => {
  it('exposes the GVK KServe serves', () => {
    expect(InferenceService.getGVK()).toEqual({
      apiVersion: 'v1beta1',
      group: 'serving.kserve.io',
      plural: 'inferenceservices',
      isCore: false,
      supportedVersions: ['v1beta1'],
    });
  });

  describe('predictor spec', () => {
    it('reads storage URI, runtime, format and pinned node', () => {
      const isvc = makeInferenceService({
        spec: {
          predictor: {
            nodeSelector: { 'kubernetes.io/hostname': 'gpu-node-1' },
            model: {
              modelFormat: { name: 'vLLM' },
              runtime: 'kserve-vllm',
              storageUri: 'hf://Qwen/Qwen3-14B',
            },
          },
        },
      });

      expect(isvc.getStorageUri()).toBe('hf://Qwen/Qwen3-14B');
      expect(isvc.getRuntime()).toBe('kserve-vllm');
      expect(isvc.getModelFormat()).toBe('vLLM');
      expect(isvc.getPinnedNode()).toBe('gpu-node-1');
    });

    it('prefers an explicit nodeName over the hostname selector', () => {
      const isvc = makeInferenceService({
        spec: {
          predictor: {
            nodeName: 'gpu-node-2',
            nodeSelector: { 'kubernetes.io/hostname': 'gpu-node-1' },
          },
        },
      });

      expect(isvc.getPinnedNode()).toBe('gpu-node-2');
    });

    it('sums GPU requests over the model and custom containers', () => {
      const isvc = makeInferenceService({
        spec: {
          predictor: {
            model: {
              resources: { requests: { 'nvidia.com/gpu': '1' } },
            },
            containers: [
              {
                name: 'sidecar',
                resources: { limits: { 'nvidia.com/gpu': '2' } },
              },
              { name: 'cpu-only', resources: { requests: { cpu: '1' } } },
            ],
          },
        },
      });

      expect(isvc.getGpuRequest()).toBe(3);
    });

    it('reports no GPU request when none is declared', () => {
      expect(
        makeInferenceService({
          spec: { predictor: { model: { storageUri: 'pvc://models/x' } } },
        }).getGpuRequest(),
      ).toBeUndefined();
    });
  });

  describe('readiness', () => {
    it('is pending without any status', () => {
      expect(makeInferenceService().getReadiness()).toBe('pending');
    });

    it('is ready when the Ready condition is True for the current generation', () => {
      expect(makeInferenceService({ status: readyStatus }).getReadiness()).toBe(
        'ready',
      );
    });

    it('is pending when the status lags behind the spec generation', () => {
      expect(
        makeInferenceService({
          status: { ...readyStatus, observedGeneration: 1 },
        }).getReadiness(),
      ).toBe('pending');
    });

    it('is notReady for Ready=False and Ready=Unknown', () => {
      for (const status of ['False', 'Unknown']) {
        expect(
          deriveInferenceServiceReadiness({
            apiVersion: 'serving.kserve.io/v1beta1',
            kind: 'InferenceService',
            metadata: { name: 'x' },
            status: { conditions: [{ type: 'Ready', status }] },
          }),
        ).toBe('notReady');
      }
    });

    it('explains a non-ready state from the Ready condition first', () => {
      const isvc = makeInferenceService({
        status: {
          conditions: [
            {
              type: 'Ready',
              status: 'False',
              reason: 'RevisionFailed',
              message: 'Revision failed: OOMKilled',
            },
          ],
          modelStatus: {
            lastFailureInfo: {
              reason: 'ModelLoadFailed',
              message: 'load failed',
            },
          },
        },
      });

      expect(isvc.getReadinessMessage()).toBe('Revision failed: OOMKilled');
    });

    it('falls back to the last model-load failure, then a failing component', () => {
      expect(
        makeInferenceService({
          status: {
            conditions: [{ type: 'Ready', status: 'False' }],
            modelStatus: {
              lastFailureInfo: {
                reason: 'ModelLoadFailed',
                message: 'CUDA out of memory',
              },
            },
          },
        }).getReadinessMessage(),
      ).toBe('ModelLoadFailed: CUDA out of memory');

      expect(
        makeInferenceService({
          status: {
            conditions: [
              { type: 'Ready', status: 'Unknown' },
              {
                type: 'PredictorReady',
                status: 'False',
                message: 'Deployment does not have minimum availability.',
              },
            ],
          },
        }).getReadinessMessage(),
      ).toBe('Deployment does not have minimum availability.');
    });
  });

  describe('endpoints', () => {
    it('reads the external and in-cluster URLs', () => {
      const isvc = makeInferenceService({ status: readyStatus });

      expect(isvc.getUrl()).toBe('https://qwen3-14b.models.example.test');
      expect(isvc.getInternalUrl()).toBe(
        'http://qwen3-14b-predictor.kserve.svc.cluster.local',
      );
      expect(isvc.getPredictorServiceName()).toBe('qwen3-14b-predictor');
    });

    it('lists every hostname the model answers on, without duplicates', () => {
      const isvc = makeInferenceService({ status: readyStatus });

      expect(isvc.getEndpointHosts()).toEqual([
        'qwen3-14b-predictor.kserve.svc.cluster.local',
        'qwen3-14b-predictor.kserve.svc',
        'qwen3-14b-predictor.kserve',
        'qwen3-14b.models.example.test',
        'qwen3-14b-predictor.models.example.test',
      ]);
    });

    it('derives the Service DNS names even before a status exists', () => {
      expect(makeInferenceService().getEndpointHosts()).toEqual([
        'qwen3-14b-predictor.kserve.svc.cluster.local',
        'qwen3-14b-predictor.kserve.svc',
        'qwen3-14b-predictor.kserve',
      ]);
    });
  });
});

describe('urlHostname', () => {
  it('lower-cases the host and ignores scheme, port and path', () => {
    expect(urlHostname('HTTP://Qwen3-Predictor.kserve.svc:80/v1')).toBe(
      'qwen3-predictor.kserve.svc',
    );
  });

  it('is undefined for empty or non-URL values', () => {
    expect(urlHostname(undefined)).toBeUndefined();
    expect(urlHostname('not a url')).toBeUndefined();
  });
});
