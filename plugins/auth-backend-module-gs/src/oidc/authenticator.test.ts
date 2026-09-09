import { oidcAuthenticator } from '@backstage/plugin-auth-backend-module-oidc-provider';
import { gsOidcAuthenticator, requestedConnectorId } from './authenticator';

jest.mock('@backstage/plugin-auth-backend-module-oidc-provider', () => ({
  oidcAuthenticator: {
    initialize: jest.fn(),
    start: jest.fn(),
    authenticate: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    defaultProfileTransform: jest.fn(),
    scopes: { persist: true, required: ['openid', 'profile', 'email'] },
  },
}));

const mockInitialize = oidcAuthenticator.initialize as jest.Mock;

const input = { callbackUrl: 'https://portal.example/callback' } as Parameters<
  typeof oidcAuthenticator.initialize
>[0];

function initializeResult(promise: Promise<unknown>) {
  return {
    initializedPrompt: 'auto',
    searchParams: { connector: 'giantswarm' },
    promise,
  };
}

describe('gsOidcAuthenticator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates request handling to the upstream authenticator', () => {
    expect(gsOidcAuthenticator.authenticate).toBe(
      oidcAuthenticator.authenticate,
    );
    expect(gsOidcAuthenticator.logout).toBe(oidcAuthenticator.logout);
  });

  describe('refresh', () => {
    const mockRefresh = oidcAuthenticator.refresh as jest.Mock;
    const ctx = initializeResult(
      Promise.resolve({ helper: 'helper' }),
    ) as unknown as Parameters<typeof gsOidcAuthenticator.refresh>[1];
    // What the OAuth adapter hands over: the scope set it will report as
    // granted (the request merged with the granted-scope cookie) and whether
    // the sign-in's grant already covers it (`scopes.persist` is on for the
    // upstream oidc authenticator, so the flag is always set).
    const refreshInput = (scopeAlreadyGranted: boolean | undefined) =>
      ({
        req: {},
        refreshToken: 'refresh-token',
        scope:
          'openid profile email groups offline_access federated:id audience:server:client_id:dex-k8s-authenticator',
        scopeAlreadyGranted,
      }) as Parameters<typeof oidcAuthenticator.refresh>[0];
    const refreshed = {
      fullProfile: {},
      session: { accessToken: 'a', tokenType: 'bearer', scope: '' },
    };

    it('refreshes a session whose grant covers the requested scopes', async () => {
      mockRefresh.mockResolvedValue(refreshed);

      await expect(
        gsOidcAuthenticator.refresh(refreshInput(true), ctx),
      ).resolves.toBe(refreshed);

      expect(mockRefresh).toHaveBeenCalledWith(refreshInput(true), ctx);
    });

    it('refuses to refresh a session whose grant is a strict subset of the requested scopes', async () => {
      // The sign-in happened while `gs.auth.extraScopes` was unset; the
      // configuration has since gained `federated:id` and the apiserver
      // audience, so the frontend refreshes with the wider set. Dex would
      // answer with a token carrying the old scopes only; instead of passing
      // that off as the requested set, the refresh fails and the frontend
      // signs in afresh.
      await expect(
        gsOidcAuthenticator.refresh(refreshInput(false), ctx),
      ).rejects.toThrow(
        /signed in with fewer scopes than this refresh asks for/,
      );

      expect(mockRefresh).not.toHaveBeenCalled();
    });

    it('cannot tell without persisted scopes and refreshes as upstream does', async () => {
      mockRefresh.mockResolvedValue(refreshed);

      await expect(
        gsOidcAuthenticator.refresh(refreshInput(undefined), ctx),
      ).resolves.toBe(refreshed);

      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });
  });

  describe('start', () => {
    const mockStart = oidcAuthenticator.start as jest.Mock;
    const ctx = initializeResult(
      Promise.resolve({ helper: 'helper' }),
    ) as unknown as Parameters<typeof gsOidcAuthenticator.start>[1];
    const startInput = (query: unknown) =>
      ({ scope: 'openid', state: 's', req: { query } }) as Parameters<
        typeof oidcAuthenticator.start
      >[0];

    it('passes the request through untouched when no connector is asked for', async () => {
      mockStart.mockResolvedValue({ url: 'https://dex/auth', status: 302 });

      await gsOidcAuthenticator.start(startInput({ env: 'production' }), ctx);

      expect(mockStart).toHaveBeenCalledWith(
        expect.objectContaining({ scope: 'openid' }),
        ctx,
      );
    });

    it('pins the requested connector on top of the configured search params', async () => {
      mockStart.mockResolvedValue({ url: 'https://dex/auth', status: 302 });

      await gsOidcAuthenticator.start(
        startInput({ env: 'production', connector_id: 'giantswarm-ad' }),
        ctx,
      );

      const [, pinned] = mockStart.mock.calls[0];
      expect(pinned.searchParams).toEqual({
        connector: 'giantswarm',
        connector_id: 'giantswarm-ad',
      });
      expect(pinned.initializedPrompt).toBe('auto');
      // the lazy discovery getter is preserved, not evaluated eagerly
      await expect(pinned.promise).resolves.toEqual({ helper: 'helper' });
      // the configured context is not mutated
      expect(ctx.searchParams).toEqual({ connector: 'giantswarm' });
    });

    it('ignores malformed connector ids', async () => {
      mockStart.mockResolvedValue({ url: 'https://dex/auth', status: 302 });

      for (const bad of ['../x', 'a b', ['giantswarm-ad'], '', 42]) {
        mockStart.mockClear();
        await gsOidcAuthenticator.start(startInput({ connector_id: bad }), ctx);
        expect(mockStart).toHaveBeenCalledWith(expect.anything(), ctx);
      }
    });
  });

  describe('requestedConnectorId', () => {
    it('accepts plain identifiers only', () => {
      expect(
        requestedConnectorId({ query: { connector_id: 'giantswarm-github' } }),
      ).toBe('giantswarm-github');
      expect(requestedConnectorId({ query: {} })).toBeUndefined();
      expect(requestedConnectorId({})).toBeUndefined();
      expect(
        requestedConnectorId({ query: { connector_id: 'a/b' } }),
      ).toBeUndefined();
    });
  });

  it('passes through context fields and memoizes a successful discovery', async () => {
    const discovered = { helper: 'helper' };
    mockInitialize.mockReturnValue(
      initializeResult(Promise.resolve(discovered)),
    );

    const ctx = gsOidcAuthenticator.initialize(input);

    expect(ctx.initializedPrompt).toBe('auto');
    expect(ctx.searchParams).toEqual({ connector: 'giantswarm' });
    await expect(ctx.promise).resolves.toBe(discovered);
    await expect(ctx.promise).resolves.toBe(discovered);
    // one eager initialize, no re-discovery after success
    expect(mockInitialize).toHaveBeenCalledTimes(1);
  });

  it('retries discovery on the next request instead of caching a rejection', async () => {
    const discovered = { helper: 'helper' };
    mockInitialize
      .mockReturnValueOnce(
        initializeResult(Promise.reject(new Error('ECONNREFUSED'))),
      )
      .mockReturnValueOnce(initializeResult(Promise.resolve(discovered)));

    const ctx = gsOidcAuthenticator.initialize(input);

    // the eager discovery fails: the request that awaits it sees the error...
    await expect(ctx.promise).rejects.toThrow('ECONNREFUSED');
    // ...and the next request triggers a fresh discovery that succeeds
    await expect(ctx.promise).resolves.toBe(discovered);
    expect(mockInitialize).toHaveBeenCalledTimes(2);

    // success is memoized again
    await expect(ctx.promise).resolves.toBe(discovered);
    expect(mockInitialize).toHaveBeenCalledTimes(2);
  });

  it('shares an in-flight discovery between concurrent requests', async () => {
    let rejectDiscovery: (err: Error) => void;
    mockInitialize.mockReturnValue(
      initializeResult(
        new Promise((_resolve, reject) => {
          rejectDiscovery = reject;
        }),
      ),
    );

    const ctx = gsOidcAuthenticator.initialize(input);

    const first = ctx.promise;
    const second = ctx.promise;
    expect(second).toBe(first);
    expect(mockInitialize).toHaveBeenCalledTimes(1);

    rejectDiscovery!(new Error('ECONNREFUSED'));
    await expect(first).rejects.toThrow('ECONNREFUSED');
    await expect(second).rejects.toThrow('ECONNREFUSED');
  });

  it('recovers when the eager discovery fails before any request is in flight', async () => {
    const discovered = { helper: 'helper' };
    mockInitialize
      .mockReturnValueOnce(
        initializeResult(Promise.reject(new Error('ECONNREFUSED'))),
      )
      .mockReturnValueOnce(initializeResult(Promise.resolve(discovered)));

    const ctx = gsOidcAuthenticator.initialize(input);

    // no request awaits the failing eager discovery; flush microtasks so the
    // rejection settles unobserved (an unhandled rejection would crash node)
    await new Promise(resolve => setImmediate(resolve));

    // the first request after the failure triggers a fresh discovery
    await expect(ctx.promise).resolves.toBe(discovered);
    expect(mockInitialize).toHaveBeenCalledTimes(2);
  });
});
