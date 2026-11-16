import { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { analyticsApiRef } from '@backstage/core-plugin-api';
import { mockApis, TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ModelConfig,
  ModelConfigInterface,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useDeleteModelConfig } from './useDeleteModelConfig';

// The reads and writes are mocked; the provenance/ownership helpers and the
// resource classes are the real ones, so the label reading and GVK resolution
// under test are the real thing.
const mockDeleteResource = jest.fn();
const mockDeleteModel = jest.fn();
jest.mock('./useAgentManager', () => ({
  useAgentManagerClient: () => ({ deleteModel: mockDeleteModel }),
}));
const mockFetchResourceList = jest.fn();

jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  deleteResource: (...args: unknown[]) => mockDeleteResource(...args),
  fetchResourceList: (...args: unknown[]) => mockFetchResourceList(...args),
}));

const CLUSTER = 'gazelle';
const NAMESPACE = 'kagent';

const analyticsApi = mockApis.analytics.mock();

function makeModelConfig({
  labels,
  apiKeySecret = 'kagent-qwen3',
}: {
  labels?: Record<string, string>;
  apiKeySecret?: string;
} = {}): ModelConfig {
  return new ModelConfig(
    {
      apiVersion: 'api.kagent.dev/v1alpha3',
      kind: 'ModelConfig',
      metadata: { name: 'qwen3', namespace: NAMESPACE, labels },
      spec: {
        provider: 'OpenAI',
        model: 'qwen3-8-27b',
        apiKeySecret,
        apiKeySecretKey: 'OPENAI_API_KEY',
      },
    } as ModelConfigInterface,
    CLUSTER,
  );
}

function makeAgentJson(modelConfig: string) {
  return {
    apiVersion: 'api.kagent.dev/v1alpha3',
    kind: 'Agent',
    metadata: { name: `agent-on-${modelConfig}`, namespace: NAMESPACE },
    spec: {
      harnessRef: { name: 'kagent' },
      template: { modelConfig: { name: modelConfig } },
    },
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

  // agent-manager's dry run answers whether this person may delete it.
  mockDeleteModel.mockImplementation(
    async (
      _namespace: string,
      _name: string,
      options?: { dryRun?: boolean },
    ) => {
      if (options?.dryRun && !allowed) {
        throw Object.assign(
          new Error('forbidden: needs agent-platform:admin'),
          {
            code: 'forbidden',
          },
        );
      }
      return { deleted: !options?.dryRun };
    },
  );

  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <TestApiProvider
      apis={[
        [kubernetesApiRef, { proxy: jest.fn() }],
        [analyticsApiRef, analyticsApi],
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

  return renderHook(() => useDeleteModelConfig(modelConfig), { wrapper });
}

beforeEach(() => {
  jest.mocked(analyticsApi.captureEvent).mockClear();
  mockDeleteResource.mockReset();
  mockDeleteModel.mockReset();
  mockDeleteResource.mockResolvedValue(undefined);
  mockFetchResourceList.mockReset();
});

describe('useDeleteModelConfig', () => {
  it('offers the deletion when agent-manager accepts it for this person', async () => {
    const { result } = setup();

    expect(result.current.isCheckingDeletable).toBe(true);
    expect(result.current.isDeletable).toBe(false);
    await waitFor(() => expect(result.current.isDeletable).toBe(true));
    expect(result.current.isCheckingDeletable).toBe(false);
  });

  it("asks agent-manager's dry run for the named model, not the cluster", async () => {
    const { result } = setup();

    await waitFor(() => expect(result.current.isDeletable).toBe(true));
    expect(mockDeleteModel).toHaveBeenCalledWith(NAMESPACE, 'qwen3', {
      dryRun: true,
    });
    expect(mockDeleteModel).toHaveBeenCalledTimes(1);
  });

  it('withholds the deletion when agent-manager refuses this person', async () => {
    const { result } = setup({ allowed: false });

    await waitFor(() => expect(result.current.isCheckingDeletable).toBe(false));
    expect(result.current.isDeletable).toBe(false);
    expect(mockDeleteModel).toHaveBeenCalledWith(NAMESPACE, 'qwen3', {
      dryRun: true,
    });
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
    expect(mockDeleteModel).not.toHaveBeenCalled();
  });

  it('refuses while an agent still references the model', async () => {
    const { result } = setup({ agents: [makeAgentJson('qwen3')] });

    await act(async () => {
      await expect(result.current.deleteModelConfig()).rejects.toThrow(
        /still used by agent agent-on-qwen3/,
      );
    });

    expect(mockDeleteResource).not.toHaveBeenCalled();
    expect(analyticsApi.captureEvent).not.toHaveBeenCalled();
  });

  it('ignores agents on other models', async () => {
    const { result } = setup({ agents: [makeAgentJson('other-model')] });

    await act(async () => {
      await result.current.deleteModelConfig();
    });

    expect(mockDeleteModel).toHaveBeenCalledWith(NAMESPACE, 'qwen3');
    expect(mockDeleteResource).not.toHaveBeenCalled();
  });

  it('refuses when the referenced-by check cannot be read', async () => {
    // Unlike an agent's shared chart source (which agent-manager keeps when
    // it cannot tell), the unsafe direction here is proceeding: deleting a
    // referenced model breaks every agent on it. A failed read is a refusal.
    const { result } = setup({ didReadAgents: false });

    await act(async () => {
      await expect(result.current.deleteModelConfig()).rejects.toThrow(
        /Could not verify/,
      );
    });

    expect(mockDeleteResource).not.toHaveBeenCalled();
  });
});

it('deletes through agent-manager without a model or Secret write from the portal', async () => {
  const { result } = setup();
  await act(async () => {
    await result.current.deleteModelConfig();
  });
  expect(mockDeleteModel).toHaveBeenCalledWith(NAMESPACE, 'qwen3');
  expect(mockDeleteResource).not.toHaveBeenCalled();
  expect(analyticsApi.captureEvent).toHaveBeenCalledTimes(1);
  expect(analyticsApi.captureEvent).toHaveBeenCalledWith(
    expect.objectContaining({
      action: 'AgentPlatform.modelDeleted',
      attributes: {},
    }),
  );
});

it('does not report a deletion when the manager refuses it', async () => {
  const { result } = setup();
  mockDeleteModel.mockRejectedValue(new Error('forbidden'));
  await act(async () => {
    await expect(result.current.deleteModelConfig()).rejects.toThrow(
      'forbidden',
    );
  });
  expect(analyticsApi.captureEvent).not.toHaveBeenCalled();
  expect(mockDeleteResource).not.toHaveBeenCalled();
});
