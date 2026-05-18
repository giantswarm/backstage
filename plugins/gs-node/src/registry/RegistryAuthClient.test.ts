import fetch from 'node-fetch';
import { RegistryAuthClient, RegistryCredentials } from './RegistryAuthClient';

jest.mock('node-fetch');
const mockFetch = fetch as unknown as jest.Mock;

const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  child: jest.fn(),
};

function createMockResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Unauthorized',
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

const wwwAuthenticateHeader =
  'Bearer realm="https://gsociprivate.azurecr.io/oauth2/token",service="gsociprivate.azurecr.io",scope="repository:charts/giantswarm/alfred-app:metadata_read"';

describe('RegistryAuthClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should make an anonymous token request when no credentials are configured', async () => {
    const client = new RegistryAuthClient(mockLogger);

    // First call: registry returns 401
    mockFetch.mockResolvedValueOnce(
      createMockResponse(
        401,
        {},
        {
          'www-authenticate': wwwAuthenticateHeader,
        },
      ),
    );
    // Second call: token endpoint returns token
    mockFetch.mockResolvedValueOnce(
      createMockResponse(200, { access_token: 'anon-token' }),
    );
    // Third call: retry with token succeeds
    mockFetch.mockResolvedValueOnce(
      createMockResponse(200, { tags: ['1.0.0'] }),
    );

    const response = await client.fetch(
      'https://gsociprivate.azurecr.io/v2/charts/giantswarm/alfred-app/tags/list',
      'application/json',
    );

    expect(response.status).toBe(200);

    // Token request should NOT have Authorization header
    const tokenRequestCall = mockFetch.mock.calls[1];
    expect(tokenRequestCall[1].headers).toEqual({
      Accept: 'application/json',
    });
  });

  it('should include Basic Auth in token request when credentials are configured', async () => {
    const credentials = new Map<string, RegistryCredentials>();
    credentials.set('gsociprivate.azurecr.io', {
      username: 'myuser',
      password: 'mypass',
    });

    const client = new RegistryAuthClient(mockLogger, undefined, credentials);

    // First call: registry returns 401
    mockFetch.mockResolvedValueOnce(
      createMockResponse(
        401,
        {},
        {
          'www-authenticate': wwwAuthenticateHeader,
        },
      ),
    );
    // Second call: token endpoint returns token
    mockFetch.mockResolvedValueOnce(
      createMockResponse(200, { access_token: 'auth-token' }),
    );
    // Third call: retry with token succeeds
    mockFetch.mockResolvedValueOnce(
      createMockResponse(200, { tags: ['1.0.0'] }),
    );

    const response = await client.fetch(
      'https://gsociprivate.azurecr.io/v2/charts/giantswarm/alfred-app/tags/list',
      'application/json',
    );

    expect(response.status).toBe(200);

    // Token request should have Basic Auth header
    const tokenRequestCall = mockFetch.mock.calls[1];
    const expectedBasicAuth = Buffer.from('myuser:mypass').toString('base64');
    expect(tokenRequestCall[1].headers).toEqual({
      Accept: 'application/json',
      Authorization: `Basic ${expectedBasicAuth}`,
    });

    // Retry request should use Bearer token
    const retryCall = mockFetch.mock.calls[2];
    expect(retryCall[1].headers).toEqual({
      Accept: 'application/json',
      Authorization: 'Bearer auth-token',
    });
  });

  it('should not send credentials for a non-matching registry host', async () => {
    const credentials = new Map<string, RegistryCredentials>();
    credentials.set('other-registry.azurecr.io', {
      username: 'otheruser',
      password: 'otherpass',
    });

    const client = new RegistryAuthClient(mockLogger, undefined, credentials);

    // First call: registry returns 401
    mockFetch.mockResolvedValueOnce(
      createMockResponse(
        401,
        {},
        {
          'www-authenticate': wwwAuthenticateHeader,
        },
      ),
    );
    // Second call: token endpoint returns token (anonymous)
    mockFetch.mockResolvedValueOnce(
      createMockResponse(200, { access_token: 'anon-token' }),
    );
    // Third call: retry succeeds
    mockFetch.mockResolvedValueOnce(
      createMockResponse(200, { tags: ['1.0.0'] }),
    );

    await client.fetch(
      'https://gsociprivate.azurecr.io/v2/charts/giantswarm/alfred-app/tags/list',
      'application/json',
    );

    // Token request should NOT have Authorization header
    const tokenRequestCall = mockFetch.mock.calls[1];
    expect(tokenRequestCall[1].headers).toEqual({
      Accept: 'application/json',
    });
  });

  it('should use cached token on subsequent requests', async () => {
    const credentials = new Map<string, RegistryCredentials>();
    credentials.set('gsociprivate.azurecr.io', {
      username: 'myuser',
      password: 'mypass',
    });

    const client = new RegistryAuthClient(mockLogger, undefined, credentials);

    // First request: 401 -> token -> retry
    mockFetch.mockResolvedValueOnce(
      createMockResponse(
        401,
        {},
        {
          'www-authenticate': wwwAuthenticateHeader,
        },
      ),
    );
    mockFetch.mockResolvedValueOnce(
      createMockResponse(200, { access_token: 'cached-token' }),
    );
    mockFetch.mockResolvedValueOnce(
      createMockResponse(200, { tags: ['1.0.0'] }),
    );

    await client.fetch(
      'https://gsociprivate.azurecr.io/v2/charts/giantswarm/alfred-app/tags/list',
      'application/json',
    );

    expect(mockFetch).toHaveBeenCalledTimes(3);
    mockFetch.mockClear();

    // Second request: 401 -> cached token used (no token endpoint call) -> retry
    mockFetch.mockResolvedValueOnce(
      createMockResponse(
        401,
        {},
        {
          'www-authenticate': wwwAuthenticateHeader,
        },
      ),
    );
    mockFetch.mockResolvedValueOnce(
      createMockResponse(200, { tags: ['2.0.0'] }),
    );

    await client.fetch(
      'https://gsociprivate.azurecr.io/v2/charts/giantswarm/alfred-app/tags/list',
      'application/json',
    );

    // Should only be 2 calls (initial + retry), no token request
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should pass through successful responses without authentication', async () => {
    const client = new RegistryAuthClient(mockLogger);

    mockFetch.mockResolvedValueOnce(
      createMockResponse(200, { tags: ['1.0.0'] }),
    );

    const response = await client.fetch(
      'https://gsoci.azurecr.io/v2/charts/giantswarm/public-app/tags/list',
      'application/json',
    );

    expect(response.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
