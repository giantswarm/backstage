import { mockServices } from '@backstage/backend-test-utils';
import {
  deriveKagentApiBaseUrl,
  KagentClient,
  readKagentInstallationsFromConfig,
} from './KagentClient';

describe('deriveKagentApiBaseUrl', () => {
  it('derives the oauth2-proxy-fronted kagent host', () => {
    expect(deriveKagentApiBaseUrl('gazelle.awsprod.gigantic.io')).toBe(
      'https://kagent.gazelle.awsprod.gigantic.io/api',
    );
  });

  it('returns undefined without a base domain', () => {
    expect(deriveKagentApiBaseUrl(undefined)).toBeUndefined();
    expect(deriveKagentApiBaseUrl('')).toBeUndefined();
  });
});

describe('readKagentInstallationsFromConfig', () => {
  const logger = mockServices.logger.mock();

  function read(data: object) {
    return readKagentInstallationsFromConfig(
      mockServices.rootConfig({ data }),
      logger,
    );
  }

  it('derives every gs installation that has a base domain', () => {
    const result = read({
      gs: {
        installations: {
          gazelle: { baseDomain: 'gazelle.example.io' },
          golem: { baseDomain: 'golem.example.io' },
        },
      },
    });

    expect([...result.keys()]).toEqual(['gazelle', 'golem']);
    expect(result.get('gazelle')?.apiBaseUrl).toBe(
      'https://kagent.gazelle.example.io/api',
    );
  });

  it('skips installations without a base domain', () => {
    const result = read({
      gs: {
        installations: {
          gazelle: { baseDomain: 'gazelle.example.io' },
          nodomain: {},
        },
      },
    });

    expect([...result.keys()]).toEqual(['gazelle']);
  });

  it('treats an explicit block as the allowlist', () => {
    const result = read({
      gs: {
        installations: {
          gazelle: { baseDomain: 'gazelle.example.io' },
          golem: { baseDomain: 'golem.example.io' },
        },
      },
      agentPlatform: { kagent: { installations: { golem: {} } } },
    });

    expect([...result.keys()]).toEqual(['golem']);
    // An empty entry still derives from the base domain.
    expect(result.get('golem')?.apiBaseUrl).toBe(
      'https://kagent.golem.example.io/api',
    );
  });

  it('lets apiBaseUrl override the derived URL', () => {
    const result = read({
      gs: { installations: { golem: { baseDomain: 'golem.example.io' } } },
      agentPlatform: {
        kagent: {
          installations: {
            golem: {
              apiBaseUrl: 'https://agentgateway.golem.example.io/kagent/api',
            },
          },
        },
      },
    });

    expect(result.get('golem')?.apiBaseUrl).toBe(
      'https://agentgateway.golem.example.io/kagent/api',
    );
  });

  it('allows an override for an installation with no base domain', () => {
    const result = read({
      gs: { installations: { local: {} } },
      agentPlatform: {
        kagent: {
          installations: { local: { apiBaseUrl: 'http://localhost:8083/api' } },
        },
      },
    });

    expect(result.get('local')?.apiBaseUrl).toBe('http://localhost:8083/api');
  });

  it('strips trailing slashes', () => {
    const result = read({
      gs: { installations: { golem: {} } },
      agentPlatform: {
        kagent: {
          installations: { golem: { apiBaseUrl: 'https://kagent.x/api/' } },
        },
      },
    });

    expect(result.get('golem')?.apiBaseUrl).toBe('https://kagent.x/api');
  });

  it('returns an empty map when nothing is configured', () => {
    expect(read({}).size).toBe(0);
  });
});

describe('KagentClient', () => {
  const logger = mockServices.logger.mock();
  const installation = {
    name: 'gazelle',
    apiBaseUrl: 'https://kagent.gazelle.example.io/api',
  };

  function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }

  function build(fetchFn: jest.Mock) {
    return new KagentClient(
      installation,
      logger,
      fetchFn as unknown as typeof fetch,
      5_000,
    );
  }

  it('requests the sessions path with the expected headers', async () => {
    const fetchFn = jest.fn().mockResolvedValue(jsonResponse({ error: false }));

    await build(fetchFn).listSessions({ userToken: 'user-token' });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://kagent.gazelle.example.io/api/sessions');
    expect(init.headers).toEqual({
      Accept: 'application/json',
      Authorization: 'Bearer user-token',
    });
    // An oauth2-proxy redirect into Dex must surface as an error, not be
    // followed into a 200 HTML sign-in page.
    expect(init.redirect).toBe('manual');
    expect(init.signal).toBeDefined();
  });

  it('omits the Authorization header when no token is given', async () => {
    const fetchFn = jest.fn().mockResolvedValue(jsonResponse({}));

    await build(fetchFn).getVersion({});

    expect(fetchFn.mock.calls[0][1].headers).toEqual({
      Accept: 'application/json',
    });
  });

  it('resolves /version against the origin, not under /api', async () => {
    // kagent serves /version at the server root (APIPathVersion), so appending
    // it to the configured base URL would 404.
    const fetchFn = jest
      .fn()
      .mockResolvedValue(jsonResponse({ kagent_version: '0.9.9' }));

    await build(fetchFn).getVersion({ userToken: 't' });

    expect(fetchFn.mock.calls[0][0]).toBe(
      'https://kagent.gazelle.example.io/version',
    );
  });

  it('requests /me under the API base URL', async () => {
    const fetchFn = jest.fn().mockResolvedValue(jsonResponse({ sub: 'a@b.c' }));

    await build(fetchFn).getMe({ userToken: 't' });

    expect(fetchFn.mock.calls[0][0]).toBe(
      'https://kagent.gazelle.example.io/api/me',
    );
  });

  it('returns the body verbatim without unwrapping or filtering', async () => {
    const body = {
      error: false,
      data: [{ id: 'a', source: 'agent', unknown_field: 1 }, { id: 'b' }],
      message: 'Successfully listed sessions',
    };
    const fetchFn = jest.fn().mockResolvedValue(jsonResponse(body));

    const result = await build(fetchFn).listSessions({ userToken: 't' });

    expect(result).toEqual(body);
  });

  describe('error mapping', () => {
    it.each([
      [302, 'AuthenticationError'],
      [401, 'AuthenticationError'],
      [403, 'NotAllowedError'],
      [404, 'NotFoundError'],
      [500, 'ServiceUnavailableError'],
      [503, 'ServiceUnavailableError'],
    ])('maps status %s to %s', async (status, expectedName) => {
      const fetchFn = jest
        .fn()
        .mockResolvedValue(new Response('', { status } as ResponseInit));

      await expect(
        build(fetchFn).listSessions({ userToken: 't' }),
      ).rejects.toMatchObject({ name: expectedName });
    });

    it('treats a 200 HTML body as a sign-in page', async () => {
      const fetchFn = jest.fn().mockResolvedValue(
        new Response('<html>Sign in</html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
      );

      await expect(
        build(fetchFn).listSessions({ userToken: 't' }),
      ).rejects.toMatchObject({ name: 'AuthenticationError' });
    });

    it('maps a transport failure to ServiceUnavailableError', async () => {
      const fetchFn = jest.fn().mockRejectedValue(new Error('ENOTFOUND'));

      await expect(
        build(fetchFn).listSessions({ userToken: 't' }),
      ).rejects.toMatchObject({ name: 'ServiceUnavailableError' });
    });

    it('maps an abort/timeout to ServiceUnavailableError', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      const fetchFn = jest.fn().mockRejectedValue(abortError);

      await expect(
        build(fetchFn).listSessions({ userToken: 't' }),
      ).rejects.toMatchObject({ name: 'ServiceUnavailableError' });
    });

    it('names the installation in the error message', async () => {
      const fetchFn = jest.fn().mockRejectedValue(new Error('nope'));

      await expect(
        build(fetchFn).listSessions({ userToken: 't' }),
      ).rejects.toThrow(/gazelle/);
    });
  });
});
