import type { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { analyticsApiRef } from '@backstage/core-plugin-api';
import { mockApis, TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ModelConfig,
  type ModelConfigInterface,
} from '@giantswarm/backstage-plugin-kubernetes-react';

import { useSetDefaultModelConfig } from './useSetDefaultModelConfig';

const mockCallTool = jest.fn();
const analyticsApi = mockApis.analytics.mock();
const mockDescribeTool = jest.fn(async () => ({
  inputSchema: {
    // The tool takes create: a write of an existing model still never sends it.
    properties: Object.fromEntries(
      [
        'projectID',
        'location',
        'endpoint',
        'displayName',
        'noCredential',
        'create',
      ].map(field => [field, {}]),
    ),
  },
}));
jest.mock('./useMusterPluginApi', () => ({
  useMusterPluginApi: () => ({
    callTool: mockCallTool,
    describeTool: mockDescribeTool,
  }),
}));
let mockDirectoryFailure: string | undefined;
jest.mock('../components/OrganizationDirectoryProvider', () => ({
  ...jest.requireActual('../components/OrganizationDirectoryProvider'),
  useOrganizationDirectory: () => ({
    directory: new Map(),
    installations: ['gazelle'],
    isLoadingOf: () => false,
    failureOf: () => mockDirectoryFailure,
    discoveryFailureOf: () => undefined,
  }),
}));
jest.mock('@backstage/frontend-plugin-api', () => ({
  ...jest.requireActual('@backstage/frontend-plugin-api'),
  useRouteRef: () => () => '/credential-form',
}));

function setup() {
  const wrapper = ({ children }: PropsWithChildren) => (
    <TestApiProvider apis={[[analyticsApiRef, analyticsApi]]}>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { mutations: { retry: false } } })
        }
      >
        {children}
      </QueryClientProvider>
    </TestApiProvider>
  );
  return renderHook(() => useSetDefaultModelConfig(), { wrapper });
}

const model = new ModelConfig(
  {
    apiVersion: 'api.kagent.dev/v1alpha3',
    kind: 'ModelConfig',
    metadata: { name: 'sonnet', namespace: 'kagent' },
    spec: { provider: 'Anthropic', model: 'claude-sonnet' },
  } as ModelConfigInterface,
  'gazelle',
);

beforeEach(() => {
  mockDirectoryFailure = undefined;
  mockCallTool.mockReset();
  analyticsApi.captureEvent.mockClear();
});

it('sets the installation default through agent-manager without a credential value', async () => {
  mockCallTool.mockResolvedValue({ defaultModel: 'sonnet' });
  const { result } = setup();
  await act(async () => {
    await result.current.setDefault({ modelConfig: model });
  });
  expect(mockCallTool).toHaveBeenCalledWith(
    'x_agent-manager_set_organization_model',
    {
      namespace: 'kagent',
      name: 'sonnet',
      default: true,
      requestId: expect.any(String),
    },
    'gazelle',
    { urlElicitation: false },
  );
  expect(analyticsApi.captureEvent).toHaveBeenCalledTimes(1);
  expect(analyticsApi.captureEvent).toHaveBeenCalledWith(
    expect.objectContaining({
      action: 'AgentPlatform.defaultModelSet',
      attributes: {},
    }),
  );
});

it('opens the credential form when the default operation needs a missing credential', async () => {
  mockCallTool.mockResolvedValue({
    pending: true,
    credentialOperation: 'a1'.repeat(24),
  });
  const { result } = setup();
  let saved;
  await act(async () => {
    saved = await result.current.setDefault({
      modelConfig: model,
    });
  });
  expect(saved).toEqual({ form: '/credential-form' });
  expect(analyticsApi.captureEvent).not.toHaveBeenCalled();
});

it('refuses a manager without the model credential contract before issuing a write', async () => {
  mockDescribeTool.mockResolvedValueOnce({ inputSchema: { properties: {} } });
  const { result } = setup();
  await act(async () => {
    await expect(
      result.current.setDefault({ modelConfig: model }),
    ).rejects.toThrow('model credential operations');
  });
  expect(mockCallTool).not.toHaveBeenCalled();
  expect(analyticsApi.captureEvent).not.toHaveBeenCalled();
});

it('does not report a default change when the manager refuses it', async () => {
  mockCallTool.mockRejectedValue(new Error('forbidden'));
  const { result } = setup();
  await act(async () => {
    await expect(
      result.current.setDefault({ modelConfig: model }),
    ).rejects.toThrow();
  });
  expect(analyticsApi.captureEvent).not.toHaveBeenCalled();
});

it('reads the installation tool schema once for consecutive writes', async () => {
  mockDescribeTool.mockClear();
  mockCallTool.mockResolvedValue({ defaultModel: 'sonnet' });
  const { result } = setup();
  await act(async () => {
    await result.current.setDefault({ modelConfig: model });
  });
  await act(async () => {
    await result.current.setDefault({ modelConfig: model });
  });
  expect(
    mockCallTool.mock.calls.filter(
      ([tool]) => tool === 'x_agent-manager_set_organization_model',
    ),
  ).toHaveLength(2);
  expect(mockDescribeTool).toHaveBeenCalledTimes(1);
  expect(mockDescribeTool).toHaveBeenCalledWith(
    'x_agent-manager_set_organization_model',
    'gazelle',
  );
});

it('refuses a namespace it cannot tell from an organization, writing nothing', async () => {
  mockDirectoryFailure = 'Could not reach agent-manager on gazelle.';
  const { result } = setup();
  const elsewhere = new ModelConfig(
    {
      apiVersion: 'api.kagent.dev/v1alpha3',
      kind: 'ModelConfig',
      metadata: { name: 'sonnet', namespace: 'agents-payments-x7k2q' },
      spec: { provider: 'Anthropic', model: 'claude-sonnet' },
    } as ModelConfigInterface,
    'gazelle',
  );
  await act(async () => {
    await expect(
      result.current.setDefault({ modelConfig: elsewhere }),
    ).rejects.toThrow(
      "Could not tell whether agents-payments-x7k2q is an organization's namespace or the installation's",
    );
  });
  expect(mockCallTool).not.toHaveBeenCalled();
});

describe('in an organization applied from git, where agent-manager opens pull requests', () => {
  const NAMESPACE = 'agents-payments-x7k2q';
  const PULL_REQUEST = {
    repository: 'giantswarm/gazelle-configs',
    base: 'main',
    pullRequest: 'https://github.com/giantswarm/gazelle-configs/pull/7',
    number: 7,
  };
  const organizationModel = new ModelConfig(
    {
      apiVersion: 'api.kagent.dev/v1alpha3',
      kind: 'ModelConfig',
      metadata: { name: 'sonnet', namespace: NAMESPACE },
      spec: { provider: 'Anthropic', model: 'claude-sonnet' },
    } as ModelConfigInterface,
    'gazelle',
  );

  function answer(orphaned?: { status: string; reason: string }) {
    mockCallTool.mockImplementation(async (tool: string, args) => {
      switch (tool) {
        case 'x_agent-manager_get_info':
          return { capabilities: { organizations: true, commit: true } };
        case 'x_agent-manager_list_organizations':
          return {
            organizations: [
              {
                name: 'payments',
                namespace: NAMESPACE,
                ...(orphaned ? { orphaned } : {}),
                permissions: { manage: false, member: true },
              },
            ],
          };
        default:
          return args.mode === 'commit'
            ? { defaultModel: 'other', commit: PULL_REQUEST }
            : { defaultModel: 'sonnet' };
      }
    });
  }

  it('moves the mark by pull request, and reports no default set', async () => {
    answer({ status: 'False', reason: 'InInventory' });
    const { result } = setup();
    let saved;
    await act(async () => {
      saved = await result.current.setDefault({
        modelConfig: organizationModel,
      });
    });
    expect(mockCallTool).toHaveBeenCalledWith(
      'x_agent-manager_set_organization_model',
      expect.objectContaining({ default: true, mode: 'commit' }),
      'gazelle',
      { urlElicitation: false },
    );
    expect(saved).toEqual({ commit: PULL_REQUEST });
    await waitFor(() =>
      expect(result.current.pullRequest).toEqual(PULL_REQUEST),
    );
    expect(analyticsApi.captureEvent).not.toHaveBeenCalled();
  });

  it('moves the mark of a live organization live', async () => {
    answer();
    const { result } = setup();
    await act(async () => {
      await result.current.setDefault({ modelConfig: organizationModel });
    });
    const [, args] = mockCallTool.mock.calls.find(
      ([tool]) => tool === 'x_agent-manager_set_organization_model',
    )!;
    expect(args).not.toHaveProperty('mode');
  });
});
