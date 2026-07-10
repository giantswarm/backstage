import { oidcAuthenticator } from '@backstage/plugin-auth-backend-module-oidc-provider';
import { gsOidcAuthenticator } from './authenticator';

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
    expect(gsOidcAuthenticator.start).toBe(oidcAuthenticator.start);
    expect(gsOidcAuthenticator.authenticate).toBe(
      oidcAuthenticator.authenticate,
    );
    expect(gsOidcAuthenticator.refresh).toBe(oidcAuthenticator.refresh);
    expect(gsOidcAuthenticator.logout).toBe(oidcAuthenticator.logout);
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
