import { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useServeModel } from './useServeModel';

// Only the write verb is mocked; the GVK it is called with is the real class's.
const mockCreateResource = jest.fn();

jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  createResource: (...args: unknown[]) => mockCreateResource(...args),
}));

const manifest = {
  apiVersion: 'serving.kserve.io/v1beta1',
  kind: 'InferenceService',
  metadata: { name: 'qwen3-14b', namespace: 'model-serving' },
  spec: { predictor: { model: { runtime: 'kserve-vllm' } } },
};

function setup() {
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

  return renderHook(() => useServeModel(), { wrapper });
}

beforeEach(() => {
  mockCreateResource.mockReset();
  mockCreateResource.mockResolvedValue(undefined);
});

describe('useServeModel', () => {
  it('creates the InferenceService in the serving namespace with the user proxy', async () => {
    const { result } = setup();

    await act(async () => {
      await result.current.serve({
        installation: 'gazelle',
        namespace: 'model-serving',
        manifest,
      });
    });

    expect(mockCreateResource).toHaveBeenCalledTimes(1);
    expect(mockCreateResource).toHaveBeenCalledWith(
      expect.objectContaining({
        cluster: 'gazelle',
        namespace: 'model-serving',
        gvk: expect.objectContaining({
          group: 'serving.kserve.io',
          apiVersion: 'v1beta1',
          plural: 'inferenceservices',
        }),
        manifest,
      }),
    );
    expect(result.current.error).toBeNull();
  });

  it('surfaces the apiserver refusal', async () => {
    const forbidden = new Error(
      'Failed to create inferenceservices on gazelle. Reason: inferenceservices.serving.kserve.io is forbidden: User "dev" cannot create resource "inferenceservices".',
    );
    forbidden.name = 'ForbiddenError';
    mockCreateResource.mockRejectedValueOnce(forbidden);

    const { result } = setup();

    await act(async () => {
      await expect(
        result.current.serve({
          installation: 'gazelle',
          namespace: 'model-serving',
          manifest,
        }),
      ).rejects.toThrow(/forbidden/);
    });

    // The mutation's error state reaches React on a later tick than the
    // rejection does, so poll for it instead of asserting right away.
    await waitFor(() => expect(result.current.error).toBe(forbidden));
  });
});
