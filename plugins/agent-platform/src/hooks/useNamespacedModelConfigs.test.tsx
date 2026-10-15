import { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  agentNamespacesOf,
  useNamespacedModelConfigs,
} from './useNamespacedModelConfigs';

const mockFetchResourceList = jest.fn();
jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  fetchResourceList: (...args: unknown[]) => mockFetchResourceList(...args),
}));

let mockMusterApi: object | undefined = {};
jest.mock('./useMusterPluginApi', () => ({
  useMusterPluginApi: () => mockMusterApi,
}));

let mockPresence = 'available';
jest.mock('./useAgentManager', () => ({
  useAgentManagerAvailability: () => ({
    presenceOf: () => mockPresence,
    isLoading: false,
  }),
}));

const mockGetInfo = jest.fn();
jest.mock('../apis/AgentManagerClient', () => ({
  AgentManagerClient: jest.fn().mockImplementation(() => ({
    getInfo: () => mockGetInfo(),
  })),
}));

function modelConfigJson(name: string, namespace: string) {
  return {
    apiVersion: 'api.kagent.dev/v1alpha3',
    kind: 'ModelConfig',
    metadata: { name, namespace },
    spec: { provider: 'Anthropic', model: 'claude' },
  };
}

function named(name: string, message: string): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

/**
 * The person's RBAC per namespace: `read` lists one model, `forbidden`
 * refuses, `broken` fails otherwise (a timeout, a 500).
 */
function namespaces(rbac: Record<string, 'read' | 'forbidden' | 'broken'>) {
  mockFetchResourceList.mockImplementation(
    async ({ namespace }: { namespace: string }) => {
      switch (rbac[namespace] ?? 'forbidden') {
        case 'read':
          return [modelConfigJson('default-model-config', namespace)];
        case 'broken':
          throw new Error('HTTP 500');
        default:
          throw named('ForbiddenError', 'modelconfigs is forbidden');
      }
    },
  );
}

function listedNamespaces() {
  return mockFetchResourceList.mock.calls.map(([options]) => options.namespace);
}

function renderNamespaced(installations: string[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <TestApiProvider apis={[[kubernetesApiRef, {}]]}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestApiProvider>
  );
  return {
    queryClient,
    ...renderHook(() => useNamespacedModelConfigs(installations), {
      wrapper,
    }),
  };
}

describe('agentNamespacesOf', () => {
  it('always reads the platform namespace beside agent-manager’s', () => {
    expect(
      agentNamespacesOf({
        namespaces: { default: 'agents', managed: ['team-a'] },
      } as never),
    ).toEqual(['kagent', 'agents', 'team-a']);
  });

  it('falls back to the platform namespace on an empty or missing answer', () => {
    expect(
      agentNamespacesOf({ namespaces: { default: '', managed: [] } } as never),
    ).toEqual(['kagent']);
    expect(agentNamespacesOf({} as never)).toEqual(['kagent']);
    expect(agentNamespacesOf(undefined)).toEqual(['kagent']);
  });
});

describe('useNamespacedModelConfigs', () => {
  beforeEach(() => {
    mockFetchResourceList.mockReset();
    mockGetInfo.mockReset();
    mockMusterApi = {};
    mockPresence = 'available';
  });

  it('reads the models of the namespaces a person with a namespaced RoleBinding may read, skipping the refused ones', async () => {
    mockGetInfo.mockResolvedValue({
      namespaces: { default: 'kagent', managed: ['team-a'] },
    });
    namespaces({ kagent: 'read', 'team-a': 'forbidden' });

    const { result } = renderNamespaced(['gazelle']);

    await waitFor(() =>
      expect(result.current.pendingInstallations).toEqual([]),
    );
    expect(result.current.unreadInstallations).toEqual([]);
    expect(
      result.current.resources.map(mc => [mc.cluster, mc.getNamespace()]),
    ).toEqual([['gazelle', 'kagent']]);
    expect(listedNamespaces()).toEqual(['kagent', 'team-a']);
  });

  it('stays pending until every namespace has answered', async () => {
    mockGetInfo.mockResolvedValue({
      namespaces: { default: 'kagent', managed: ['team-a'] },
    });
    let answerTeamA: (items: unknown[]) => void = () => {};
    mockFetchResourceList.mockImplementation(
      ({ namespace }: { namespace: string }) =>
        namespace === 'kagent'
          ? Promise.resolve([modelConfigJson('default-model-config', 'kagent')])
          : new Promise(resolve => {
              answerTeamA = resolve;
            }),
    );

    const { result } = renderNamespaced(['gazelle']);

    await waitFor(() => expect(result.current.resources).toHaveLength(1));
    expect(result.current.pendingInstallations).toEqual(['gazelle']);

    answerTeamA([modelConfigJson('team-model', 'team-a')]);
    await waitFor(() =>
      expect(result.current.pendingInstallations).toEqual([]),
    );
    expect(result.current.resources).toHaveLength(2);
  });

  it('leaves an installation unread when a namespace fails for another reason', async () => {
    mockGetInfo.mockResolvedValue({
      namespaces: { default: 'kagent', managed: ['team-a'] },
    });
    namespaces({ kagent: 'read', 'team-a': 'broken' });

    const { result } = renderNamespaced(['gazelle']);

    await waitFor(() =>
      expect(result.current.pendingInstallations).toEqual([]),
    );
    expect(result.current.unreadInstallations).toEqual(['gazelle']);
    expect(result.current.resources).toHaveLength(1);
  });

  it('leaves an installation unread when every namespace refuses', async () => {
    mockGetInfo.mockResolvedValue({
      namespaces: { default: 'kagent', managed: [] },
    });
    namespaces({});

    const { result } = renderNamespaced(['gazelle']);

    await waitFor(() =>
      expect(result.current.pendingInstallations).toEqual([]),
    );
    expect(result.current.unreadInstallations).toEqual(['gazelle']);
    expect(result.current.resources).toEqual([]);
  });

  it('reads the platform namespace when agent-manager fails to answer', async () => {
    mockGetInfo.mockRejectedValue(new Error('agent-manager is not reachable'));
    namespaces({ kagent: 'read' });

    const { result } = renderNamespaced(['gazelle']);

    await waitFor(() => expect(result.current.resources).toHaveLength(1));
    expect(result.current.unreadInstallations).toEqual([]);
  });

  it('asks no agent-manager its muster does not list, and reads the platform namespace', async () => {
    mockPresence = 'missing';
    namespaces({ kagent: 'read' });

    const { result } = renderNamespaced(['gazelle']);

    await waitFor(() => expect(result.current.resources).toHaveLength(1));
    expect(mockGetInfo).not.toHaveBeenCalled();
    expect(listedNamespaces()).toEqual(['kagent']);
  });

  it('never persists the per-person lists', async () => {
    mockPresence = 'missing';
    namespaces({ kagent: 'read' });

    const { result, queryClient } = renderNamespaced(['gazelle']);

    await waitFor(() => expect(result.current.resources).toHaveLength(1));
    const [list] = queryClient
      .getQueryCache()
      .findAll({ queryKey: ['cluster', 'gazelle', 'list'] });
    expect(list.meta).toEqual({ persist: false });
    expect(list.queryKey.at(-1)).toBe(
      '/apis/api.kagent.dev/v1alpha3/namespaces/kagent/modelconfigs/',
    );
  });
});
