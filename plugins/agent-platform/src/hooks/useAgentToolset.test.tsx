import { renderHook } from '@testing-library/react';
import {
  Agent,
  RemoteMCPServer,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useAgentToolset } from './useAgentToolset';

const mockUseResources = jest.fn();
jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  useResources: (...args: unknown[]) => mockUseResources(...args),
}));

const agent = new Agent(
  {
    apiVersion: 'kagent.dev/v1alpha3',
    kind: 'AgentTemplate',
    metadata: { name: 'pr-reviewer', namespace: 'kagent' },
    spec: {
      tools: [
        { mcp: { server: { kind: 'RemoteMCPServer', name: 'pr-reviewer' } } },
      ],
    },
  } as never,
  'gazelle',
);

function carrier(toolset?: string) {
  return new RemoteMCPServer(
    {
      apiVersion: 'kagent.dev/v1alpha3',
      kind: 'RemoteMCPServer',
      metadata: { name: 'pr-reviewer', namespace: 'kagent' },
      spec: {
        description: 'gateway',
        url: 'http://muster.agent-platform.svc.cluster.local:8090/mcp',
        headersFrom: toolset
          ? [{ name: 'X-Muster-Toolset', value: toolset }]
          : undefined,
      },
    } as never,
    'gazelle',
  );
}

describe('useAgentToolset', () => {
  beforeEach(() => mockUseResources.mockReset());

  it('reads the carrier RemoteMCPServers of the agent’s own namespace', () => {
    mockUseResources.mockReturnValue({
      resources: [carrier('preset:read-only')],
      isLoading: false,
      errors: [],
    });

    const { result } = renderHook(() => useAgentToolset(agent));

    expect(mockUseResources).toHaveBeenCalledWith(
      'gazelle',
      RemoteMCPServer,
      { gazelle: { namespace: 'kagent' } },
      { enableDiscovery: false },
    );
    expect(result.current).toEqual({
      state: 'declared',
      selectors: ['preset:read-only'],
      carrier: 'pr-reviewer',
    });
  });

  // Never a premature "implicit full access": until the servers have answered
  // nothing can be said about the toolset.
  it('is unresolved while the servers are still loading', () => {
    mockUseResources.mockReturnValue({
      resources: [],
      isLoading: true,
      errors: [],
    });

    const { result } = renderHook(() => useAgentToolset(agent));

    expect(result.current).toEqual({
      state: 'unresolved',
      carrier: 'pr-reviewer',
    });
  });

  it('reports implicit full access once the carrier is read without a header', () => {
    mockUseResources.mockReturnValue({
      resources: [carrier()],
      isLoading: false,
      errors: [],
    });

    const { result } = renderHook(() => useAgentToolset(agent));

    expect(result.current).toEqual({
      state: 'implicit-full',
      carrier: 'pr-reviewer',
    });
  });

  it('keeps the result’s identity across renders with the same inputs', () => {
    const resources = [carrier('preset:read-only')];
    mockUseResources.mockReturnValue({
      resources,
      isLoading: false,
      errors: [],
    });

    const { result, rerender } = renderHook(() => useAgentToolset(agent));
    const first = result.current;
    rerender();

    expect(result.current).toBe(first);
  });
});
