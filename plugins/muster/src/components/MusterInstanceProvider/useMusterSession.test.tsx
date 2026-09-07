import { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TestApiProvider } from '@backstage/test-utils';
import { MusterApi, musterApiRef, MusterTokenMintError } from '../../apis';
import {
  MusterInstance,
  MusterInstanceContext,
} from './MusterInstanceProvider';
import {
  classifySessionFailure,
  musterRejectionDetail,
  unreachableFailure,
  useMusterSession,
} from './useMusterSession';

const MUSTER_401 =
  'MCP HTTP Transport Error: POSTing to endpoint (HTTP 401): {"error":"invalid_token","error_description":"Token validation failed"}';

function named(name: string, message: string): Error {
  return Object.assign(new Error(message), { name });
}

function instance(overrides: Partial<MusterInstance> = {}): MusterInstance {
  return {
    installations: ['gazelle', 'golem'],
    isLoadingInstallations: false,
    installationInfos: [],
    activeInstallation: 'golem',
    scope: 'golem',
    homeInstallation: 'gazelle',
    isSingleInstallation: false,
    activeInstallationInfo: { name: 'golem', requiresAuth: true },
    setActiveInstallation: jest.fn(),
    mcpServers: [],
    workflows: [],
    isLoading: false,
    dataUpdatedAt: undefined,
    isRefreshing: false,
    retry: jest.fn(),
    ...overrides,
  };
}

type Api = Pick<MusterApi, 'filterTools' | 'signIn'>;

function wrapper(api: Api, value: MusterInstance) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <TestApiProvider apis={[[musterApiRef, api]]}>
      <QueryClientProvider client={queryClient}>
        <MusterInstanceContext.Provider value={value}>
          {children}
        </MusterInstanceContext.Provider>
      </QueryClientProvider>
    </TestApiProvider>
  );
}

const PROBE_OK = { total: 484, filtered_count: 1, truncated: true, tools: [] };

describe('useMusterSession', () => {
  it('is pending until the probe answers, then authenticated', async () => {
    let resolveProbe: (value: typeof PROBE_OK) => void = () => {};
    const api: Api = {
      filterTools: jest.fn(
        () => new Promise<typeof PROBE_OK>(res => (resolveProbe = res)),
      ),
      signIn: jest.fn(),
    };
    const { result } = renderHook(() => useMusterSession(), {
      wrapper: wrapper(api, instance()),
    });

    expect(result.current.pending).toBe(true);
    expect(result.current.authenticated).toBe(false);
    expect(result.current.failure).toBeUndefined();

    act(() => resolveProbe(PROBE_OK));

    await waitFor(() => expect(result.current.authenticated).toBe(true));
    expect(result.current.pending).toBe(false);
    expect(result.current.failure).toBeUndefined();
    expect(api.filterTools).toHaveBeenCalledWith({
      installation: 'golem',
      limit: 1,
    });
  });

  it('reports an expired portal session when the mint says so', async () => {
    const api: Api = {
      filterTools: jest
        .fn()
        .mockRejectedValue(
          new MusterTokenMintError(
            'golem',
            'session-expired',
            'Your portal session has expired; no token could be minted for muster on golem.',
          ),
        ),
      signIn: jest.fn(),
    };
    const { result } = renderHook(() => useMusterSession(), {
      wrapper: wrapper(api, instance()),
    });

    await waitFor(() => expect(result.current.failure).toBeDefined());
    expect(result.current.failure).toEqual({
      kind: 'session-expired',
      message:
        'Your portal session has expired; no token could be minted for muster on golem.',
    });
    expect(result.current.authenticated).toBe(false);
    expect(result.current.pending).toBe(false);
  });

  it('reports a failed mint with its cause', async () => {
    const api: Api = {
      filterTools: jest
        .fn()
        .mockRejectedValue(
          new MusterTokenMintError(
            'golem',
            'mint-failed',
            'Could not mint a token for muster on golem: Token broker is unreachable',
          ),
        ),
      signIn: jest.fn(),
    };
    const { result } = renderHook(() => useMusterSession(), {
      wrapper: wrapper(api, instance()),
    });

    await waitFor(() =>
      expect(result.current.failure?.kind).toBe('mint-failed'),
    );
    expect(result.current.failure?.message).toMatch(
      /Token broker is unreachable/,
    );
  });

  it("quotes muster's own message when it rejects the token", async () => {
    const api: Api = {
      filterTools: jest
        .fn()
        .mockRejectedValue(named('UnauthorizedError', MUSTER_401)),
      signIn: jest.fn(),
    };
    const { result } = renderHook(() => useMusterSession(), {
      wrapper: wrapper(api, instance()),
    });

    await waitFor(() =>
      expect(result.current.failure?.kind).toBe('muster-rejected'),
    );
    expect(result.current.failure?.message).toBe(
      'muster on golem rejected the token: Token validation failed',
    );
  });

  it('quotes any other answer from muster as an error', async () => {
    const api: Api = {
      filterTools: jest
        .fn()
        .mockRejectedValue(
          named('ServiceUnavailableError', 'muster is unreachable'),
        ),
      signIn: jest.fn(),
    };
    const { result } = renderHook(() => useMusterSession(), {
      wrapper: wrapper(api, instance()),
    });

    await waitFor(() =>
      expect(result.current.failure?.kind).toBe('muster-rejected'),
    );
    expect(result.current.failure?.message).toBe(
      'muster on golem answered with an error: muster is unreachable',
    );
  });

  it('connect re-runs the mint for the active installation and re-probes', async () => {
    const api: Api = {
      filterTools: jest
        .fn()
        .mockRejectedValueOnce(named('UnauthorizedError', MUSTER_401))
        .mockResolvedValue(PROBE_OK),
      signIn: jest.fn().mockResolvedValue(true),
    };
    const { result } = renderHook(() => useMusterSession(), {
      wrapper: wrapper(api, instance()),
    });
    await waitFor(() =>
      expect(result.current.failure?.kind).toBe('muster-rejected'),
    );

    await act(() => result.current.connect());

    expect(api.signIn).toHaveBeenCalledWith('golem');
    expect(api.filterTools).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(result.current.authenticated).toBe(true));
    expect(result.current.failure).toBeUndefined();
    expect(result.current.connecting).toBe(false);
  });

  describe('an installation the backend reports as not reachable from this portal', () => {
    const unreachableGolem = instance({
      activeInstallationInfo: {
        name: 'golem',
        requiresAuth: true,
        reachable: false,
        reason: 'no answer within 3000 ms',
      },
    });

    it('does not run the probe and reports the unreachable failure with no pending state', async () => {
      const api: Api = {
        filterTools: jest.fn().mockResolvedValue(PROBE_OK),
        signIn: jest.fn(),
      };
      const { result } = renderHook(() => useMusterSession(), {
        wrapper: wrapper(api, unreachableGolem),
      });

      expect(result.current.pending).toBe(false);
      expect(result.current.authenticated).toBe(false);
      expect(result.current.failure).toEqual({
        kind: 'unreachable',
        message:
          'muster on golem is not reachable from this portal (no answer within 3000 ms).',
      });

      // Give a would-be probe every chance to fire: it must not.
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(api.filterTools).not.toHaveBeenCalled();
    });

    it('does not mint a token when connect is called anyway', async () => {
      const api: Api = {
        filterTools: jest.fn().mockResolvedValue(PROBE_OK),
        signIn: jest.fn().mockResolvedValue(true),
      };
      const { result } = renderHook(() => useMusterSession(), {
        wrapper: wrapper(api, unreachableGolem),
      });

      await act(() => result.current.connect());

      expect(api.signIn).not.toHaveBeenCalled();
      expect(api.filterTools).not.toHaveBeenCalled();
      expect(result.current.failure?.kind).toBe('unreachable');
    });

    it('is unreachable even when the installation needs no token', async () => {
      const api: Api = {
        filterTools: jest.fn().mockResolvedValue(PROBE_OK),
        signIn: jest.fn(),
      };
      const { result } = renderHook(() => useMusterSession(), {
        wrapper: wrapper(
          api,
          instance({
            activeInstallationInfo: {
              name: 'golem',
              requiresAuth: false,
              reachable: false,
            },
          }),
        ),
      });

      expect(result.current.authenticated).toBe(false);
      expect(result.current.failure).toEqual({
        kind: 'unreachable',
        message: 'muster on golem is not reachable from this portal.',
      });
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(api.filterTools).not.toHaveBeenCalled();
    });

    it.each([true, 'unknown'] as const)(
      'probes as usual when reachability is %s',
      async reachable => {
        const api: Api = {
          filterTools: jest.fn().mockResolvedValue(PROBE_OK),
          signIn: jest.fn(),
        };
        const { result } = renderHook(() => useMusterSession(), {
          wrapper: wrapper(
            api,
            instance({
              activeInstallationInfo: {
                name: 'golem',
                requiresAuth: true,
                reachable,
              },
            }),
          ),
        });

        await waitFor(() => expect(result.current.authenticated).toBe(true));
        expect(api.filterTools).toHaveBeenCalledTimes(1);
        expect(result.current.failure).toBeUndefined();
      },
    );
  });

  it('is authenticated without a session when the installation needs no token', async () => {
    const api: Api = {
      filterTools: jest
        .fn()
        .mockRejectedValue(named('ServiceUnavailableError', 'down')),
      signIn: jest.fn(),
    };
    const { result } = renderHook(() => useMusterSession(), {
      wrapper: wrapper(
        api,
        instance({
          activeInstallationInfo: { name: 'golem', requiresAuth: false },
        }),
      ),
    });

    expect(result.current.authenticated).toBe(true);
    expect(result.current.pending).toBe(false);
    await waitFor(() => expect(api.filterTools).toHaveBeenCalled());
    expect(result.current.authenticated).toBe(true);
    expect(result.current.failure).toBeUndefined();
  });
});

describe('musterRejectionDetail', () => {
  it("extracts the error_description from muster's relayed 401 body", () => {
    expect(musterRejectionDetail(MUSTER_401)).toBe('Token validation failed');
  });

  it('falls back to the error code, then to the raw message', () => {
    expect(
      musterRejectionDetail('POSTing (HTTP 401): {"error":"invalid_token"}'),
    ).toBe('invalid_token');
    expect(musterRejectionDetail('authentication failure: no session')).toBe(
      'authentication failure: no session',
    );
    expect(musterRejectionDetail('broken { json')).toBe('broken { json');
  });
});

describe('unreachableFailure', () => {
  it('names the installation and the backend reason, and copes without either', () => {
    expect(
      unreachableFailure('golem', 'DNS lookup failed (ENOTFOUND)'),
    ).toEqual({
      kind: 'unreachable',
      message:
        'muster on golem is not reachable from this portal (DNS lookup failed (ENOTFOUND)).',
    });
    expect(unreachableFailure(undefined, undefined)).toEqual({
      kind: 'unreachable',
      message: 'muster is not reachable from this portal.',
    });
  });
});

describe('classifySessionFailure', () => {
  it('keeps the mint error message and reason', () => {
    expect(
      classifySessionFailure(
        new MusterTokenMintError('golem', 'mint-failed', 'Could not mint'),
        'golem',
      ),
    ).toEqual({ kind: 'mint-failed', message: 'Could not mint' });
  });

  it('treats an auth error from the proxy as muster rejecting the token', () => {
    expect(
      classifySessionFailure(
        named('ForbiddenError', 'authentication failure: audience'),
        'golem',
      ),
    ).toEqual({
      kind: 'muster-rejected',
      message:
        'muster on golem rejected the token: authentication failure: audience',
    });
  });

  it('copes with an error that has no message', () => {
    expect(classifySessionFailure(undefined, undefined)).toEqual({
      kind: 'muster-rejected',
      message: 'muster answered with an error: no details',
    });
  });
});
