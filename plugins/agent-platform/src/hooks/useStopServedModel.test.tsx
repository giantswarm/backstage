import { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { modelManagerApiRef } from '../apis';
import type { ModelManagerApi } from '../apis/ModelManagerApi';
import type { ServedModel } from '../lib/serving';
import { useStopServedModel } from './useStopServedModel';

const mockDeleteResource = jest.fn();
const unloadModel = jest.fn();
const modelManagerApi = { unloadModel } as unknown as ModelManagerApi;

jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  deleteResource: (...args: unknown[]) => mockDeleteResource(...args),
}));

const served: ServedModel = {
  id: 'gazelle/kserve/model-serving/qwen3-14b',
  installation: 'gazelle',
  backend: 'kserve',
  name: 'qwen3-14b',
  namespace: 'model-serving',
  readiness: 'ready',
  endpointHosts: [],
};

function setup() {
  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider
      apis={[
        [kubernetesApiRef, { proxy: jest.fn() }],
        [modelManagerApiRef, modelManagerApi],
      ]}
    >
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { mutations: { retry: false } } })
        }
      >
        {children}
      </QueryClientProvider>
    </TestApiProvider>
  );

  return renderHook(() => useStopServedModel(), { wrapper });
}

beforeEach(() => {
  mockDeleteResource.mockReset();
  mockDeleteResource.mockResolvedValue(undefined);
  unloadModel.mockReset();
  unloadModel.mockResolvedValue(undefined);
});

describe('useStopServedModel', () => {
  it('deletes the InferenceService', async () => {
    const { result } = setup();

    await act(async () => {
      await result.current.stop(served);
    });

    expect(mockDeleteResource).toHaveBeenCalledTimes(1);
    expect(mockDeleteResource).toHaveBeenCalledWith(
      expect.objectContaining({
        cluster: 'gazelle',
        name: 'qwen3-14b',
        namespace: 'model-serving',
        gvk: expect.objectContaining({
          group: 'serving.kserve.io',
          plural: 'inferenceservices',
        }),
      }),
    );
  });

  it('treats an already-deleted InferenceService as stopped', async () => {
    const notFound = new Error('gone');
    notFound.name = 'NotFoundError';
    mockDeleteResource.mockRejectedValueOnce(notFound);

    const { result } = setup();

    await act(async () => {
      await result.current.stop(served);
    });

    expect(result.current.error).toBeNull();
  });

  it('surfaces a refusal', async () => {
    const forbidden = new Error('inferenceservices is forbidden');
    forbidden.name = 'ForbiddenError';
    mockDeleteResource.mockRejectedValueOnce(forbidden);

    const { result } = setup();

    await act(async () => {
      await expect(result.current.stop(served)).rejects.toThrow(/forbidden/);
    });

    // The mutation's error state reaches React on a later tick than the
    // rejection does, so poll for it instead of asserting right away.
    await waitFor(() => expect(result.current.error).toBe(forbidden));
  });

  it("refuses another backend's model", async () => {
    const { result } = setup();

    await act(async () => {
      await expect(
        result.current.stop({
          ...served,
          backend: 'ollama',
          namespace: undefined,
        }),
      ).rejects.toThrow(/Only KServe/);
    });

    expect(mockDeleteResource).not.toHaveBeenCalled();
  });

  it('stops through model-manager by the InferenceService name, when asked to', async () => {
    const { result } = setup();

    await act(async () => {
      await result.current.stop({
        model: { ...served, managerRef: 'Qwen/Qwen3-14B', operable: true },
        via: 'model-manager',
      });
    });

    // The name, not the repository: an InferenceService composed from another
    // model's preset is still found by its name.
    // …and on the row's backend, so a model-manager running several never
    // mistakes a same-named reference elsewhere.
    expect(unloadModel).toHaveBeenCalledWith('gazelle', 'qwen3-14b', {
      backend: 'kserve',
    });
    expect(mockDeleteResource).not.toHaveBeenCalled();
    expect(mockDeleteResource).not.toHaveBeenCalled();
  });

  it('refuses the model-manager route for a model it does not list', async () => {
    const { result } = setup();

    await expect(
      act(async () => {
        await result.current.stop({ model: served, via: 'model-manager' });
      }),
    ).rejects.toThrow(/does not list qwen3-14b/);
    expect(unloadModel).not.toHaveBeenCalled();
    expect(mockDeleteResource).not.toHaveBeenCalled();
  });

  it('falls back to deleting the CR when model-manager serves no model it can attribute to it', async () => {
    const notFound = new Error(
      'model not found: no InferenceService serves hf-internal-testing/tiny-random-gpt2',
    );
    notFound.name = 'NotFoundError';
    unloadModel.mockRejectedValue(notFound);
    const { result } = setup();

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.stop({
        model: {
          ...served,
          managerRef: 'hf-internal-testing/tiny-random-gpt2',
          operable: true,
        },
        via: 'model-manager',
      });
    });

    expect(unloadModel).toHaveBeenCalledTimes(1);
    expect(mockDeleteResource).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'qwen3-14b',
        namespace: 'model-serving',
      }),
    );
    expect(outcome).toEqual({ via: 'inferenceservice' });
  });

  it('does not fall back on other model-manager failures', async () => {
    const refused = new Error(
      'InferenceService is not managed by model-manager',
    );
    refused.name = 'ConflictError';
    unloadModel.mockRejectedValue(refused);
    const { result } = setup();

    await expect(
      act(async () => {
        await result.current.stop({
          model: { ...served, managerRef: 'Qwen/Qwen3-14B', operable: true },
          via: 'model-manager',
        });
      }),
    ).rejects.toThrow(/not managed/);
    expect(mockDeleteResource).not.toHaveBeenCalled();
  });
});
