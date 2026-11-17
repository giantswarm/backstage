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
import { AgentManagerError } from '../lib/agentManager';
import {
  AgentManagerUnavailableError,
  useDeleteModelConfig,
} from './useDeleteModelConfig';

// The reads and writes are mocked; the provenance/ownership helpers and the
// resource classes are the real ones, so the label reading and GVK resolution
// under test are the real thing.
const mockDeleteResource = jest.fn();
const mockDeleteModel = jest.fn();
let mockWithoutClient = false;
jest.mock('./useAgentManager', () => ({
  ...jest.requireActual('./useAgentManager'),
  useAgentManagerClient: () =>
    mockWithoutClient ? undefined : { deleteModel: mockDeleteModel },
}));
// agent-manager's get_info and list_organizations, which decide the mode of
// an organization's delete; the installation's namespace reads neither.
const mockCallTool = jest.fn();
jest.mock('./useMusterPluginApi', () => ({
  useMusterPluginApi: () => ({ callTool: mockCallTool }),
}));
const ORGANIZATION_NAMESPACE = 'agents-payments-x7k2q';
jest.mock('../components/OrganizationDirectoryProvider', () => ({
  ...jest.requireActual('../components/OrganizationDirectoryProvider'),
  useOrganizationDirectory: () => ({
    directory: new Map([
      [
        'agents-payments-x7k2q',
        {
          namespace: 'agents-payments-x7k2q',
          organization: 'payments',
          parent: 'org-acme',
        },
      ],
    ]),
    installations: ['gazelle'],
    isLoadingOf: () => false,
    failureOf: () => undefined,
    discoveryFailureOf: () => undefined,
  }),
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
  namespace = NAMESPACE,
}: {
  labels?: Record<string, string>;
  apiKeySecret?: string;
  namespace?: string;
} = {}): ModelConfig {
  return new ModelConfig(
    {
      apiVersion: 'api.kagent.dev/v1alpha3',
      kind: 'ModelConfig',
      metadata: { name: 'qwen3', namespace, labels },
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
  checkFailure,
  agents = [] as ReturnType<typeof makeAgentJson>[],
  didReadAgents = true,
}: {
  modelConfig?: ModelConfig | undefined;
  allowed?: boolean;
  /** The dry run fails with this, which is no refusal. */
  checkFailure?: Error;
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
      if (options?.dryRun && checkFailure) {
        throw checkFailure;
      }
      if (options?.dryRun && !allowed) {
        throw new AgentManagerError(
          'forbidden',
          'forbidden: needs agent-platform:admin',
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
  mockWithoutClient = false;
  mockCallTool.mockReset();
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
    expect(result.current.checkError).toBeNull();
    expect(mockDeleteModel).toHaveBeenCalledWith(NAMESPACE, 'qwen3', {
      dryRun: true,
    });
  });

  it('says why when the dry run fails without a refusal, and checks again', async () => {
    const failure = new Error('muster: request timed out');
    const { result } = setup({ checkFailure: failure });

    await waitFor(() => expect(result.current.checkError).toBe(failure));
    expect(result.current.isDeletable).toBe(false);

    mockDeleteModel.mockResolvedValue({ deleted: false });
    act(() => result.current.recheckDeletable());

    await waitFor(() => expect(result.current.isDeletable).toBe(true));
    expect(result.current.checkError).toBeNull();
  });

  it('says why Delete is not offered when the portal has no agent-manager client', () => {
    mockWithoutClient = true;
    const { result } = setup();

    expect(result.current.isDeletable).toBe(false);
    expect(result.current.checkError).toBeInstanceOf(
      AgentManagerUnavailableError,
    );
    expect(result.current.checkError?.message).toBe(
      'The portal cannot reach agent-manager on gazelle, which deletes models, so Delete is not offered.',
    );
    expect(mockDeleteModel).not.toHaveBeenCalled();
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

    expect(mockDeleteModel).toHaveBeenCalledWith(NAMESPACE, 'qwen3', {});
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
  expect(mockDeleteModel).toHaveBeenCalledWith(NAMESPACE, 'qwen3', {});
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

describe("an organization's model, deleted in the organization's mode", () => {
  const PULL_REQUEST = {
    repository: 'giantswarm/gazelle-configs',
    base: 'main',
    pullRequest: 'https://github.com/giantswarm/gazelle-configs/pull/7',
    number: 7,
  };
  /** The operator's condition on an organization Flux applies from git. */
  const IN_GIT = { status: 'False', reason: 'InInventory' };

  function agentManager(commit: boolean, orphaned?: typeof IN_GIT) {
    mockCallTool.mockImplementation(async (tool: string) => {
      if (tool === 'x_agent-manager_get_info') {
        return { capabilities: { organizations: true, commit } };
      }
      return {
        organizations: [
          {
            name: 'payments',
            parent: 'org-acme',
            namespace: ORGANIZATION_NAMESPACE,
            ...(orphaned ? { orphaned } : {}),
            permissions: { manage: false, member: true },
          },
        ],
      };
    });
  }

  it.each([
    ['from git, with commit mode', true, IN_GIT, 'commit'],
    ['created live, with commit mode', true, undefined, undefined],
    ['from git, without commit mode', false, IN_GIT, undefined],
  ] as const)(
    'deletes the model of an organization %s in that mode',
    async (_, commit, orphaned, mode) => {
      agentManager(commit, orphaned);
      const { result } = setup({
        modelConfig: makeModelConfig({ namespace: ORGANIZATION_NAMESPACE }),
      });
      await waitFor(() => expect(result.current.isDeletable).toBe(true));
      await act(async () => {
        await result.current.deleteModelConfig();
      });

      const expected = mode ? { mode } : {};
      // The dry run asks as the delete will be made.
      expect(mockDeleteModel).toHaveBeenCalledWith(
        ORGANIZATION_NAMESPACE,
        'qwen3',
        { dryRun: true, ...expected },
      );
      expect(mockDeleteModel).toHaveBeenLastCalledWith(
        ORGANIZATION_NAMESPACE,
        'qwen3',
        expected,
      );
    },
  );

  it('answers the pull request, and reports no deletion', async () => {
    agentManager(true, IN_GIT);
    const { result } = setup({
      modelConfig: makeModelConfig({ namespace: ORGANIZATION_NAMESPACE }),
    });
    await waitFor(() => expect(result.current.isDeletable).toBe(true));
    mockDeleteModel.mockResolvedValue({ deleted: false, commit: PULL_REQUEST });

    let answer;
    await act(async () => {
      answer = await result.current.deleteModelConfig();
    });

    expect(answer).toEqual({ commit: PULL_REQUEST });
    await waitFor(() =>
      expect(result.current.pullRequest).toEqual(PULL_REQUEST),
    );
    expect(analyticsApi.captureEvent).not.toHaveBeenCalled();
  });

  const fromOrganizationPath = () =>
    makeModelConfig({
      namespace: ORGANIZATION_NAMESPACE,
      labels: {
        'kustomize.toolkit.fluxcd.io/name': 'payments',
        'app.kubernetes.io/managed-by': 'agent-manager',
      },
    });

  it('offers the delete of a model Flux applies from the organization in commit mode', async () => {
    agentManager(true, IN_GIT);
    const { result } = setup({ modelConfig: fromOrganizationPath() });

    await waitFor(() => expect(result.current.isDeletable).toBe(true));
    expect(result.current.owner).toBeUndefined();
  });

  it('withholds it, as before, without commit mode', async () => {
    agentManager(false, IN_GIT);
    const { result } = setup({ modelConfig: fromOrganizationPath() });

    await waitFor(() => expect(mockCallTool).toHaveBeenCalled());
    expect(result.current.isDeletable).toBe(false);
    expect(result.current.owner).toBe('Flux');
  });
});
