import { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ModelConfig } from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  useAutoWireServedModels,
  type AutoWireCandidate,
} from './useAutoWireServedModels';

// The write verbs are mocked; the manifests are composed by the real helpers
// (covered in serveModel.test.ts), so what's under test here is when the
// wiring fires, in what order it writes, and how the outcomes are reported.
const mockCreateResource = jest.fn();
const mockPatchResource = jest.fn();

jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  createResource: (...args: unknown[]) => mockCreateResource(...args),
  patchResource: (...args: unknown[]) => mockPatchResource(...args),
}));

const ready: AutoWireCandidate = {
  id: 'gazelle/kserve/model-serving/qwen3-14b',
  installation: 'gazelle',
  backend: 'kserve',
  name: 'qwen3-14b',
  namespace: 'model-serving',
  readiness: 'ready',
  internalUrl: 'http://qwen3-14b-predictor.model-serving.svc.cluster.local',
  endpointHosts: [],
  displayName: 'Qwen3 14B',
  managedByPortal: true,
  autoWire: { namespace: 'kagent', name: 'qwen3-14b' },
  usedBy: [],
};

function modelConfig(name: string, baseUrl: string): ModelConfig {
  return new ModelConfig(
    {
      apiVersion: 'kagent.dev/v1alpha2',
      kind: 'ModelConfig',
      metadata: { name, namespace: 'kagent' },
      spec: { provider: 'OpenAI', model: name, openAI: { baseUrl } },
    } as any,
    'gazelle',
  );
}

const noModelConfigs = () => [];

function setup(
  candidates: AutoWireCandidate[],
  modelConfigsFor: (installation: string) => ModelConfig[] = noModelConfigs,
  options: { modelConfigsLoading?: boolean } = {},
) {
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider apis={[[kubernetesApiRef, { proxy: jest.fn() }]]}>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { mutations: { retry: false } } })
        }
      >
        {children}
      </QueryClientProvider>
    </TestApiProvider>
  );

  return renderHook(
    () => useAutoWireServedModels(candidates, modelConfigsFor, options),
    { wrapper },
  );
}

beforeEach(() => {
  mockCreateResource.mockReset();
  mockCreateResource.mockResolvedValue(undefined);
  mockPatchResource.mockReset();
  // No Secret yet: the patch answers 404 and the create takes over.
  const notFound = new Error('no secret yet');
  notFound.name = 'NotFoundError';
  mockPatchResource.mockRejectedValue(notFound);
});

describe('useAutoWireServedModels', () => {
  it('creates the placeholder Secret and then the ModelConfig for a ready, unwired model', async () => {
    const { result } = setup([ready]);

    await waitFor(() =>
      expect(result.current.wiringFor(ready.id)).toEqual({ status: 'done' }),
    );

    expect(mockPatchResource).toHaveBeenCalledTimes(1);
    expect(mockCreateResource).toHaveBeenCalledTimes(2);
    const [secretCall, modelConfigCall] = mockCreateResource.mock.calls;
    expect(secretCall[0]).toMatchObject({
      cluster: 'gazelle',
      namespace: 'kagent',
      gvk: expect.objectContaining({ plural: 'secrets', isCore: true }),
      manifest: expect.objectContaining({
        metadata: expect.objectContaining({ name: 'kagent-qwen3-14b' }),
        stringData: { OPENAI_API_KEY: 'giantswarm-backstage-placeholder' },
      }),
    });
    expect(modelConfigCall[0]).toMatchObject({
      cluster: 'gazelle',
      namespace: 'kagent',
      gvk: expect.objectContaining({ plural: 'modelconfigs' }),
      manifest: expect.objectContaining({
        metadata: expect.objectContaining({ name: 'qwen3-14b' }),
        spec: {
          provider: 'OpenAI',
          model: 'qwen3-14b',
          apiKeySecret: 'kagent-qwen3-14b',
          apiKeySecretKey: 'OPENAI_API_KEY',
          openAI: {
            baseUrl:
              'http://qwen3-14b-predictor.model-serving.svc.cluster.local/v1',
          },
        },
      }),
    });
  });

  it.each([
    ['not ready yet', { ...ready, readiness: 'pending' as const }],
    ['failed', { ...ready, readiness: 'notReady' as const }],
    [
      'already used by a ModelConfig',
      {
        ...ready,
        usedBy: [
          {
            installation: 'gazelle',
            namespace: 'kagent',
            name: 'qwen3-14b',
            displayName: 'Qwen3 14B',
          },
        ],
      },
    ],
    ['not served by the portal', { ...ready, autoWire: undefined }],
  ])('leaves a model alone that is %s', async (_case, candidate) => {
    const { result } = setup([candidate]);

    // Give any (wrong) effect a chance to fire.
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(mockPatchResource).not.toHaveBeenCalled();
    expect(mockCreateResource).not.toHaveBeenCalled();
    expect(result.current.wiringFor(candidate.id)).toBeUndefined();
  });

  it('waits for the ModelConfig lists before deciding nobody uses a model', async () => {
    // On a fresh page the InferenceServices can answer before the
    // ModelConfigs; an empty usedBy then means "not loaded", not "unwired".
    const { result } = setup([ready], noModelConfigs, {
      modelConfigsLoading: true,
    });

    await new Promise(resolve => setTimeout(resolve, 20));

    expect(mockPatchResource).not.toHaveBeenCalled();
    expect(mockCreateResource).not.toHaveBeenCalled();
    expect(result.current.wiringFor(ready.id)).toBeUndefined();
  });

  it('reports, and does not overwrite, a same-named ModelConfig that points elsewhere', async () => {
    const { result } = setup([ready], () => [
      modelConfig('qwen3-14b', 'https://vllm.example.test/v1'),
    ]);

    await waitFor(() =>
      expect(result.current.wiringFor(ready.id)).toMatchObject({
        status: 'conflict',
        message: expect.stringContaining('https://vllm.example.test/v1'),
      }),
    );

    expect(mockPatchResource).not.toHaveBeenCalled();
    expect(mockCreateResource).not.toHaveBeenCalled();
  });

  it('treats a ModelConfig created meanwhile by another session as done', async () => {
    const conflict = new Error('modelconfigs "qwen3-14b" already exists');
    conflict.name = 'ConflictError';
    mockCreateResource.mockImplementation(async ({ gvk }: any) => {
      if (gvk.plural === 'modelconfigs') {
        throw conflict;
      }
    });

    const { result } = setup([ready]);

    await waitFor(() =>
      expect(result.current.wiringFor(ready.id)).toEqual({ status: 'done' }),
    );
  });

  it('reports a refusal in the row instead of failing silently, and does not retry', async () => {
    const forbidden = new Error(
      'Failed to create modelconfigs on gazelle. Reason: modelconfigs.kagent.dev is forbidden.',
    );
    forbidden.name = 'ForbiddenError';
    mockCreateResource.mockImplementation(async ({ gvk }: any) => {
      if (gvk.plural === 'modelconfigs') {
        throw forbidden;
      }
    });

    const { result, rerender } = setup([ready]);

    await waitFor(() =>
      expect(result.current.wiringFor(ready.id)).toMatchObject({
        status: 'error',
        message: expect.stringContaining('forbidden'),
      }),
    );

    rerender();
    await new Promise(resolve => setTimeout(resolve, 20));
    // One Secret create + one refused ModelConfig create, and no second try.
    expect(mockCreateResource).toHaveBeenCalledTimes(2);
  });
});
