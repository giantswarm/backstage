import { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useNamespacedModelConfigs } from './useNamespacedModelConfigs';

const mockFetchResourceList = jest.fn();
jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  fetchResourceList: (...args: unknown[]) => mockFetchResourceList(...args),
}));

let mockMusterApi: object | undefined = {};
jest.mock('./useMusterPluginApi', () => ({
  useMusterPluginApi: () => mockMusterApi,
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

function forbidden(): Error {
  const error = new Error('modelconfigs is forbidden');
  error.name = 'ForbiddenError';
  return error;
}

/**
 * The lab developer's RBAC: ModelConfigs readable in `kagent` only, through a
 * namespaced RoleBinding; every other namespace refuses the list.
 */
function readableIn(...namespaces: string[]) {
  mockFetchResourceList.mockImplementation(
    async ({ namespace }: { namespace: string }) => {
      if (!namespaces.includes(namespace)) {
        throw forbidden();
      }
      return [modelConfigJson('default-model-config', namespace)];
    },
  );
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
  return renderHook(() => useNamespacedModelConfigs(installations), {
    wrapper,
  });
}

describe('useNamespacedModelConfigs', () => {
  beforeEach(() => {
    mockFetchResourceList.mockReset();
    mockGetInfo.mockReset();
    mockMusterApi = {};
  });

  it('reads the models of the namespaces a person with a namespaced RoleBinding may read, skipping the others', async () => {
    mockGetInfo.mockResolvedValue({
      namespaces: { default: 'kagent', managed: ['team-a'] },
    });
    readableIn('kagent');

    const { result } = renderNamespaced(['gazelle']);

    await waitFor(() =>
      expect(result.current.readInstallations).toEqual(['gazelle']),
    );
    expect(result.current.pendingInstallations).toEqual([]);
    expect(
      result.current.resources.map(mc => [mc.cluster, mc.getNamespace()]),
    ).toEqual([['gazelle', 'kagent']]);
    expect(
      mockFetchResourceList.mock.calls.map(([options]) => options.namespace),
    ).toEqual(['kagent', 'team-a']);
  });

  it('reads the platform namespace when agent-manager cannot say', async () => {
    mockGetInfo.mockRejectedValue(new Error('agent-manager is not registered'));
    readableIn('kagent');

    const { result } = renderNamespaced(['gazelle']);

    await waitFor(() =>
      expect(result.current.readInstallations).toEqual(['gazelle']),
    );
    expect(result.current.resources).toHaveLength(1);
  });

  it('reads the platform namespace without the muster plugin', async () => {
    mockMusterApi = undefined;
    readableIn('kagent');

    const { result } = renderNamespaced(['gazelle']);

    await waitFor(() =>
      expect(result.current.readInstallations).toEqual(['gazelle']),
    );
    expect(mockGetInfo).not.toHaveBeenCalled();
  });

  it('leaves an installation unread when every namespace refuses', async () => {
    mockGetInfo.mockResolvedValue({
      namespaces: { default: 'kagent', managed: [] },
    });
    readableIn();

    const { result } = renderNamespaced(['gazelle']);

    await waitFor(() =>
      expect(result.current.pendingInstallations).toEqual([]),
    );
    expect(result.current.readInstallations).toEqual([]);
    expect(result.current.resources).toEqual([]);
  });
});
