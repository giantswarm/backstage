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

/** What `useResources` returns once its query has produced items. */
const ANSWERED = [{ cluster: 'gazelle', data: [] }];

describe('useAgentToolset', () => {
  beforeEach(() => mockUseResources.mockReset());

  it('reads the carrier RemoteMCPServers of the agent’s own namespace', () => {
    mockUseResources.mockReturnValue({
      resources: [carrier('preset:read-only')],
      isLoading: false,
      errors: [],
      clustersData: ANSWERED,
    });

    const { result } = renderHook(() => useAgentToolset(agent));

    expect(mockUseResources).toHaveBeenCalledWith(
      'gazelle',
      RemoteMCPServer,
      { gazelle: { namespace: 'kagent' } },
      { enableDiscovery: false },
    );
    expect(result.current).toEqual({
      declared: {
        state: 'declared',
        selectors: ['preset:read-only'],
        carrier: 'pr-reviewer',
      },
      isReading: false,
      isUnreadable: false,
    });
  });

  // Never a premature "implicit full access": until the servers have answered
  // nothing can be said about the toolset.
  it('is unresolved, and says it is still reading, while the servers load', () => {
    mockUseResources.mockReturnValue({
      resources: [],
      isLoading: true,
      errors: [],
      clustersData: [],
    });

    const { result } = renderHook(() => useAgentToolset(agent));

    expect(result.current).toEqual({
      declared: { state: 'unresolved', carrier: 'pr-reviewer' },
      isReading: true,
      isUnreadable: false,
    });
  });

  // The window `isLoading` misses: an enabled query reports fetchStatus 'idle'
  // on the render before it starts fetching, so nothing has been read and
  // `isLoading` is false. Reading it as an answer would claim the carrier is
  // missing for one render.
  it('is still reading when no query has answered, whatever isLoading says', () => {
    mockUseResources.mockReturnValue({
      resources: [],
      isLoading: false,
      errors: [],
      clustersData: [],
    });

    const { result } = renderHook(() => useAgentToolset(agent));

    expect(result.current.isReading).toBe(true);
  });

  it('reports the read as failed when the list errored', () => {
    mockUseResources.mockReturnValue({
      resources: [],
      isLoading: false,
      errors: [{ cluster: 'gazelle', error: { name: 'ForbiddenError' } }],
      clustersData: [],
    });

    const { result } = renderHook(() => useAgentToolset(agent));

    expect(result.current).toEqual({
      declared: { state: 'unresolved', carrier: 'pr-reviewer' },
      isReading: false,
      isUnreadable: true,
    });
  });

  // A read that answered without the bound server is a missing carrier, not an
  // unreadable one — the card says so in its own words.
  it('separates a carrier that is absent from one that could not be read', () => {
    mockUseResources.mockReturnValue({
      resources: [],
      isLoading: false,
      errors: [],
      clustersData: ANSWERED,
    });

    const { result } = renderHook(() => useAgentToolset(agent));

    expect(result.current).toEqual({
      declared: { state: 'unresolved', carrier: 'pr-reviewer' },
      isReading: false,
      isUnreadable: false,
    });
  });

  it('reports implicit full access once the carrier is read without a header', () => {
    mockUseResources.mockReturnValue({
      resources: [carrier()],
      isLoading: false,
      errors: [],
      clustersData: ANSWERED,
    });

    const { result } = renderHook(() => useAgentToolset(agent));

    expect(result.current).toEqual({
      declared: { state: 'implicit-full', carrier: 'pr-reviewer' },
      isReading: false,
      isUnreadable: false,
    });
  });

  it('keeps the result’s identity across renders with the same inputs', () => {
    const resources = [carrier('preset:read-only')];
    mockUseResources.mockReturnValue({
      resources,
      isLoading: false,
      errors: [],
      clustersData: ANSWERED,
    });

    const { result, rerender } = renderHook(() => useAgentToolset(agent));
    const first = result.current;
    rerender();

    expect(result.current).toBe(first);
  });
});
