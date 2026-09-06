import {
  BounceGuard,
  GithubGrantAuthConnector,
  GithubTokenError,
  SessionStorageBounceGuard,
  withRedirectBack,
} from './GithubGrantAuthConnector';

class MemoryGuard implements BounceGuard {
  recorded = 0;
  cleared = 0;
  constructor(private allowed = true) {}
  allow() {
    return this.allowed;
  }
  record() {
    this.recorded++;
  }
  clear() {
    this.cleared++;
  }
}

const mainAuthApi = {
  getIdToken: jest.fn().mockResolvedValue('dex-id-token'),
  getBackstageIdentity: jest.fn().mockResolvedValue({
    token: 'backstage-token',
    identity: {
      type: 'user',
      userEntityRef: 'user:default/alice',
      ownershipEntityRefs: [],
    },
  }),
  getProfile: jest.fn().mockResolvedValue({ email: 'alice@example.com' }),
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function createConnector(
  fetchMock: jest.Mock,
  options: { guard?: BounceGuard; navigate?: jest.Mock } = {},
) {
  return new GithubGrantAuthConnector({
    backendBaseUrl: 'http://backend',
    mainAuthApi: mainAuthApi as any,
    fetch: fetchMock as unknown as typeof fetch,
    navigate: options.navigate ?? jest.fn(),
    currentUrl: () =>
      'https://portal.example.com/catalog/default/component/x/ci-cd',
    bounceGuard: options.guard ?? new MemoryGuard(),
  });
}

describe('GithubGrantAuthConnector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('refreshSession', () => {
    it('mints the session from the github-token route with the Backstage token and the Dex ID token, echoing the scopes', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValue(
          jsonResponse({ token: 'ghu_live', expiresInSeconds: 27000 }),
        );
      const guard = new MemoryGuard();
      const before = Date.now();

      const session = await createConnector(fetchMock, {
        guard,
      }).refreshSession({
        scopes: new Set(['repo', 'read:org', 'read:user']),
      });

      expect(fetchMock).toHaveBeenCalledWith(
        'http://backend/api/auth/github-token',
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: 'Bearer backstage-token',
            'gs-subject-token': 'dex-id-token',
          },
        }),
      );
      expect(session.providerInfo.accessToken).toBe('ghu_live');
      expect(session.providerInfo.idToken).toBe('');
      expect([...session.providerInfo.scopes].sort()).toEqual([
        'read:org',
        'read:user',
        'repo',
      ]);
      expect(session.providerInfo.expiresAt!.getTime()).toBeGreaterThanOrEqual(
        before + 27000 * 1000 - 1000,
      );
      expect(session.profile).toEqual({ email: 'alice@example.com' });
      // A minted token proves the connect worked; the bounce record is cleared.
      expect(guard.cleared).toBe(1);
    });

    it("surfaces a missing grant as a typed no_grant error carrying muster's connect URL and never navigates", async () => {
      const navigate = jest.fn();
      const fetchMock = jest.fn().mockResolvedValue(
        jsonResponse(
          {
            error:
              "Connect GitHub in muster (server 'github') to use this page.",
            reason: 'no_grant',
            authUrl: 'https://muster.example.com/oauth/proxy/start?state=abc',
          },
          401,
        ),
      );

      await expect(
        createConnector(fetchMock, { navigate }).refreshSession({
          scopes: new Set(['repo']),
        }),
      ).rejects.toMatchObject({
        name: 'GithubTokenError',
        reason: 'no_grant',
        authUrl: 'https://muster.example.com/oauth/proxy/start?state=abc',
      });
      expect(navigate).not.toHaveBeenCalled();
    });

    it('maps broker faults to their reasons', async () => {
      const fetchMock = jest.fn().mockResolvedValue(
        jsonResponse(
          {
            error: 'Token broker is unreachable',
            reason: 'broker_unreachable',
          },
          502,
        ),
      );
      await expect(
        createConnector(fetchMock).refreshSession(),
      ).rejects.toMatchObject({
        reason: 'broker_unreachable',
      });

      const failing = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(
        createConnector(failing).refreshSession(),
      ).rejects.toMatchObject({
        reason: 'broker_unreachable',
      });
    });

    it('reports a gone main session as session-expired without calling the backend', async () => {
      mainAuthApi.getIdToken.mockRejectedValueOnce(new Error('login declined'));
      const fetchMock = jest.fn();

      await expect(
        createConnector(fetchMock).refreshSession(),
      ).rejects.toMatchObject({
        reason: 'session-expired',
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('createSession', () => {
    it("bounces the browser through muster's connect and back to the current page when there is no grant", async () => {
      const navigate = jest.fn();
      const guard = new MemoryGuard();
      const fetchMock = jest.fn().mockResolvedValue(
        jsonResponse(
          {
            reason: 'no_grant',
            authUrl: 'https://muster.example.com/oauth/proxy/start?state=abc',
          },
          401,
        ),
      );

      const pending = createConnector(fetchMock, {
        navigate,
        guard,
      }).createSession({
        scopes: new Set(['repo']),
      });
      // The promise never settles: the page is navigating away.
      const settled = await Promise.race([
        pending.then(
          () => 'settled',
          () => 'settled',
        ),
        new Promise(resolve => setTimeout(() => resolve('pending'), 20)),
      ]);
      expect(settled).toBe('pending');

      expect(navigate).toHaveBeenCalledTimes(1);
      const target = new URL(navigate.mock.calls[0][0]);
      expect(target.origin + target.pathname).toBe(
        'https://muster.example.com/oauth/proxy/start',
      );
      expect(target.searchParams.get('state')).toBe('abc');
      expect(target.searchParams.get('redirect')).toBe(
        'https://portal.example.com/catalog/default/component/x/ci-cd',
      );
      expect(guard.recorded).toBe(1);
    });

    it('does not bounce again when the last bounce came back without a grant', async () => {
      const navigate = jest.fn();
      const fetchMock = jest.fn().mockResolvedValue(
        jsonResponse(
          {
            reason: 'no_grant',
            authUrl: 'https://muster.example.com/oauth/proxy/start?state=abc',
          },
          401,
        ),
      );

      await expect(
        createConnector(fetchMock, {
          navigate,
          guard: new MemoryGuard(false),
        }).createSession({
          scopes: new Set(['repo']),
        }),
      ).rejects.toMatchObject({ reason: 'no_grant' });
      expect(navigate).not.toHaveBeenCalled();
    });

    it('mints directly when a grant exists', async () => {
      const navigate = jest.fn();
      const fetchMock = jest
        .fn()
        .mockResolvedValue(
          jsonResponse({ token: 'ghu_live', expiresInSeconds: 100 }),
        );

      const session = await createConnector(fetchMock, {
        navigate,
      }).createSession({
        scopes: new Set(['repo']),
      });
      expect(session.providerInfo.accessToken).toBe('ghu_live');
      expect(navigate).not.toHaveBeenCalled();
    });

    it('does not bounce on other failures', async () => {
      const navigate = jest.fn();
      const fetchMock = jest
        .fn()
        .mockResolvedValue(jsonResponse({ reason: 'exchange_failed' }, 502));
      await expect(
        createConnector(fetchMock, { navigate }).createSession({
          scopes: new Set(['repo']),
        }),
      ).rejects.toBeInstanceOf(GithubTokenError);
      expect(navigate).not.toHaveBeenCalled();
    });
  });

  describe('removeSession', () => {
    it('signs out through the logout route', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValue(jsonResponse({ signedOut: true }));

      await createConnector(fetchMock).removeSession();

      expect(fetchMock).toHaveBeenCalledWith(
        'http://backend/api/auth/github-token/logout',
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: 'Bearer backstage-token',
            'gs-subject-token': 'dex-id-token',
          },
        }),
      );
    });

    it('fails loudly when the logout route fails', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValue(
          new Response('nope', { status: 502, statusText: 'Bad Gateway' }),
        );
      await expect(createConnector(fetchMock).removeSession()).rejects.toThrow(
        /sign-out request failed/,
      );
    });
  });
});

describe('withRedirectBack', () => {
  it('appends the redirect target to the connect URL, keeping the state', () => {
    const url = new URL(
      withRedirectBack(
        'https://muster.example.com/oauth/proxy/start?state=abc%3Dd',
        'https://portal/x?a=1',
      ),
    );
    expect(url.searchParams.get('state')).toBe('abc=d');
    expect(url.searchParams.get('redirect')).toBe('https://portal/x?a=1');
  });
});

describe('SessionStorageBounceGuard', () => {
  it('allows once, then refuses within the guard window, then allows again', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    } as unknown as Storage;
    let now = 1_000_000;
    const guard = new SessionStorageBounceGuard(
      () => storage,
      () => now,
    );

    expect(guard.allow()).toBe(true);
    guard.record();
    expect(guard.allow()).toBe(false);
    now += 3 * 60_000;
    expect(guard.allow()).toBe(true);
    guard.record();
    guard.clear();
    expect(guard.allow()).toBe(true);
  });

  it('allows everything when storage is unavailable', () => {
    const guard = new SessionStorageBounceGuard(() => undefined);
    guard.record();
    expect(guard.allow()).toBe(true);
  });
});
