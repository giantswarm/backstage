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

/** One cluster's query, in the state a test needs it in. */
function query(
  state: Partial<Record<'isSuccess' | 'isError' | 'isPaused', boolean>>,
) {
  return [
    {
      cluster: 'gazelle',
      query: { isSuccess: false, isError: false, isPaused: false, ...state },
    },
  ];
}

/** The read answered with a list. */
const ANSWERED = query({ isSuccess: true });
/** The read has not started or is still in flight. */
const PENDING = query({});

describe('useAgentToolset', () => {
  beforeEach(() => mockUseResources.mockReset());

  it('reads the carrier RemoteMCPServers of the agent’s own namespace', () => {
    mockUseResources.mockReturnValue({
      resources: [carrier('preset:read-only')],
      queries: ANSWERED,
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
    mockUseResources.mockReturnValue({ resources: [], queries: PENDING });

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
      // The render before an enabled query starts fetching: `isLoading` is
      // already false, and nothing has been read.
      isLoading: false,
      queries: PENDING,
    });

    const { result } = renderHook(() => useAgentToolset(agent));

    expect(result.current.isReading).toBe(true);
  });

  // An empty `every` is vacuously true. Settling on it would have the card
  // pronounce on a read that never started.
  it('keeps reading when there is no query at all', () => {
    mockUseResources.mockReturnValue({ resources: [], queries: [] });

    const { result } = renderHook(() => useAgentToolset(agent));

    expect(result.current.isReading).toBe(true);
    expect(result.current.isUnreadable).toBe(false);
  });

  it('reports the read as failed when the list errored', () => {
    mockUseResources.mockReturnValue({
      resources: [],
      errors: [{ cluster: 'gazelle', error: { name: 'ForbiddenError' } }],
      queries: query({ isError: true }),
    });

    const { result } = renderHook(() => useAgentToolset(agent));

    expect(result.current).toEqual({
      declared: { state: 'unresolved', carrier: 'pr-reviewer' },
      isReading: false,
      isUnreadable: true,
    });
  });

  // `useResources` filters a RejectedError — an installation the person has
  // not authenticated with — out of `errors`. Waiting on `errors` would leave
  // this read looking unanswered for as long as the page is open.
  it('settles on a rejected read, which never reaches the errors array', () => {
    mockUseResources.mockReturnValue({
      resources: [],
      errors: [],
      queries: query({ isError: true }),
    });

    const { result } = renderHook(() => useAgentToolset(agent));

    expect(result.current.isReading).toBe(false);
    expect(result.current.isUnreadable).toBe(true);
  });

  // A refetch pausing offline over data that was already read is not a failed
  // read — the card would otherwise relabel an answered carrier as unreadable.
  it('does not call a pause over an answer a failure', () => {
    mockUseResources.mockReturnValue({
      resources: [],
      errors: [],
      queries: query({ isSuccess: true, isPaused: true }),
    });

    const { result } = renderHook(() => useAgentToolset(agent));

    expect(result.current.isReading).toBe(false);
    expect(result.current.isUnreadable).toBe(false);
  });

  // Offline the query is pending but paused: nothing is on its way.
  it('settles on a paused read', () => {
    mockUseResources.mockReturnValue({
      resources: [],
      errors: [],
      queries: query({ isPaused: true }),
    });

    const { result } = renderHook(() => useAgentToolset(agent));

    expect(result.current.isReading).toBe(false);
    expect(result.current.isUnreadable).toBe(true);
  });

  // A read that answered without the bound server is a missing carrier, not an
  // unreadable one — the card says so in its own words.
  it('separates a carrier that is absent from one that could not be read', () => {
    mockUseResources.mockReturnValue({
      resources: [],
      errors: [],
      queries: ANSWERED,
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
      queries: ANSWERED,
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
    // `useResources` hands out a fresh `errors` array on every render, so the
    // memo has to hang off booleans — the card's own memos are keyed on this
    // result, and a new identity each render re-runs all of them.
    mockUseResources.mockImplementation(() => ({
      resources,
      errors: [],
      queries: ANSWERED,
    }));

    const { result, rerender } = renderHook(() => useAgentToolset(agent));
    const first = result.current;
    rerender();

    expect(result.current).toBe(first);
  });
});
