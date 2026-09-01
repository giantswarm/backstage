import { PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { crds } from '@giantswarm/k8s-types';
import { ModelConfig } from '@giantswarm/backstage-plugin-kubernetes-react';
import { useDeleteModelConfig } from './useDeleteModelConfig';

// The reads and writes are mocked; the provenance/ownership helpers and the
// resource classes are the real ones, so the label reading and GVK resolution
// under test are the real thing.
const mockUseSelfSubjectAccessReview = jest.fn();
const mockDeleteResource = jest.fn();
const mockFetchResourceList = jest.fn();

jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  useSelfSubjectAccessReview: (...args: unknown[]) =>
    mockUseSelfSubjectAccessReview(...args),
  deleteResource: (...args: unknown[]) => mockDeleteResource(...args),
  fetchResourceList: (...args: unknown[]) => mockFetchResourceList(...args),
}));

const CLUSTER = 'gazelle';
const NAMESPACE = 'kagent';

function makeModelConfig({
  labels,
  apiKeySecret = 'kagent-qwen3',
}: {
  labels?: Record<string, string>;
  apiKeySecret?: string;
} = {}): ModelConfig {
  return new ModelConfig(
    {
      apiVersion: 'kagent.dev/v1alpha2',
      kind: 'ModelConfig',
      metadata: { name: 'qwen3', namespace: NAMESPACE, labels },
      spec: {
        provider: 'OpenAI',
        model: 'qwen3-8-27b',
        apiKeySecret,
        apiKeySecretKey: 'OPENAI_API_KEY',
      },
    } as crds.kagent.v1alpha2.ModelConfig,
    CLUSTER,
  );
}

function makeAgentJson(modelConfig: string) {
  return {
    apiVersion: 'kagent.dev/v1alpha2',
    kind: 'Agent',
    metadata: { name: `agent-on-${modelConfig}`, namespace: NAMESPACE },
    spec: { type: 'Declarative', declarative: { modelConfig } },
  };
}

function setup({
  modelConfig = makeModelConfig(),
  allowed = true,
  agents = [] as ReturnType<typeof makeAgentJson>[],
  didReadAgents = true,
}: {
  modelConfig?: ModelConfig | undefined;
  allowed?: boolean;
  agents?: ReturnType<typeof makeAgentJson>[];
  didReadAgents?: boolean;
} = {}) {
  // The referenced-by check reads a fresh list at mutation time, so it is a
  // promise here rather than a hook return.
  mockFetchResourceList.mockImplementation(async () => {
    if (!didReadAgents) {
      const error = new Error('agents is forbidden');
      error.name = 'ForbiddenError';
      throw error;
    }
    return agents;
  });

  mockUseSelfSubjectAccessReview.mockReturnValue({
    allowed,
    isLoading: false,
  });

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

  return renderHook(() => useDeleteModelConfig(modelConfig), { wrapper });
}

beforeEach(() => {
  mockUseSelfSubjectAccessReview.mockReset();
  mockDeleteResource.mockReset();
  mockDeleteResource.mockResolvedValue(undefined);
  mockFetchResourceList.mockReset();
});

describe('useDeleteModelConfig', () => {
  it('offers the deletion for an unowned model we may delete', () => {
    const { result } = setup();

    expect(result.current.isDeletable).toBe(true);
    expect(result.current.isCheckingDeletable).toBe(false);
  });

  it('checks the permission against the named ModelConfig', () => {
    setup();

    expect(mockUseSelfSubjectAccessReview).toHaveBeenCalledWith(
      CLUSTER,
      {
        group: 'kagent.dev',
        resource: 'modelconfigs',
        namespace: NAMESPACE,
        name: 'qwen3',
        verb: 'delete',
      },
      { enabled: true },
    );
  });

  it('refuses when the access review says no', () => {
    const { result } = setup({ allowed: false });

    expect(result.current.isDeletable).toBe(false);
  });

  it.each([
    ['Helm-rendered', { 'app.kubernetes.io/managed-by': 'Helm' }, 'Helm'],
    [
      'agentlab-asserted',
      { 'app.kubernetes.io/managed-by': 'agentlab' },
      'agentlab',
    ],
    [
      'Kustomization-applied',
      { 'kustomize.toolkit.fluxcd.io/name': 'models' },
      'Flux',
    ],
  ])('withholds the affordance for a %s model', (_case, labels, owner) => {
    const { result } = setup({ modelConfig: makeModelConfig({ labels }) });

    expect(result.current.isDeletable).toBe(false);
    expect(result.current.owner).toBe(owner);
  });

  it('deletes the model and its conventional key secret', async () => {
    const { result } = setup();

    await act(async () => {
      await result.current.deleteModelConfig();
    });

    expect(mockDeleteResource).toHaveBeenCalledTimes(2);
    expect(mockDeleteResource).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        name: 'qwen3',
        namespace: NAMESPACE,
        gvk: expect.objectContaining({ plural: 'modelconfigs' }),
      }),
    );
    expect(mockDeleteResource).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        name: 'kagent-qwen3',
        gvk: expect.objectContaining({ plural: 'secrets', isCore: true }),
      }),
    );
  });

  it('leaves a foreign key secret alone', async () => {
    // A hand-provisioned Secret under any other name may be shared with other
    // models; only the portal/agentlab-conventional `kagent-<name>` is 1:1.
    const { result } = setup({
      modelConfig: makeModelConfig({ apiKeySecret: 'my-shared-key' }),
    });

    await act(async () => {
      await result.current.deleteModelConfig();
    });

    expect(mockDeleteResource).toHaveBeenCalledTimes(1);
    expect(mockDeleteResource).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'qwen3' }),
    );
  });

  it('refuses while an agent still references the model', async () => {
    const { result } = setup({ agents: [makeAgentJson('qwen3')] });

    await act(async () => {
      await expect(result.current.deleteModelConfig()).rejects.toThrow(
        /still used by agent agent-on-qwen3/,
      );
    });

    expect(mockDeleteResource).not.toHaveBeenCalled();
  });

  it('ignores agents on other models', async () => {
    const { result } = setup({ agents: [makeAgentJson('other-model')] });

    await act(async () => {
      await result.current.deleteModelConfig();
    });

    expect(mockDeleteResource).toHaveBeenCalled();
  });

  it('refuses when the referenced-by check cannot be read', async () => {
    // Unlike the shared chart source in useDeleteAgent (where keeping it is
    // safe), the unsafe direction here is proceeding: deleting a referenced
    // model breaks every agent on it. A failed read is a refusal.
    const { result } = setup({ didReadAgents: false });

    await act(async () => {
      await expect(result.current.deleteModelConfig()).rejects.toThrow(
        /Could not verify/,
      );
    });

    expect(mockDeleteResource).not.toHaveBeenCalled();
  });

  it('treats an already-deleted model as success', async () => {
    const notFound = new Error('gone');
    notFound.name = 'NotFoundError';
    mockDeleteResource.mockRejectedValueOnce(notFound);
    // The secret ride-along still runs afterwards.
    mockDeleteResource.mockResolvedValueOnce(undefined);

    const { result } = setup();

    await act(async () => {
      await result.current.deleteModelConfig();
    });

    expect(result.current.error).toBeNull();
  });

  it('does not fail the deletion when only the secret cleanup fails', async () => {
    mockDeleteResource.mockImplementation(
      async ({ name }: { name: string }) => {
        if (name === 'kagent-qwen3') {
          const error = new Error('secrets is forbidden');
          error.name = 'ForbiddenError';
          throw error;
        }
      },
    );

    const { result } = setup();

    await act(async () => {
      await result.current.deleteModelConfig();
    });

    expect(result.current.error).toBeNull();
  });
});
