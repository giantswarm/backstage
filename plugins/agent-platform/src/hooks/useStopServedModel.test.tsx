import { PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ServedModel } from '../lib/serving';
import { useStopServedModel } from './useStopServedModel';

const mockDeleteResource = jest.fn();

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

  return renderHook(() => useStopServedModel(), { wrapper });
}

beforeEach(() => {
  mockDeleteResource.mockReset();
  mockDeleteResource.mockResolvedValue(undefined);
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

    expect(result.current.error).toBe(forbidden);
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
});
