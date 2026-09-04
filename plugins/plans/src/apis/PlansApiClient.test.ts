import { GithubNotConnectedError, PlansApiClient } from './PlansApiClient';

const BASE_URL = 'http://backstage/api/plans';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

/** Every request carries the caller's muster token for the backend. */
const AUTHED = {
  headers: { 'backstage-muster-authorization': 'dex-id-token' },
};

describe('PlansApiClient', () => {
  const fetchMock = jest.fn<Promise<Response>, [string, RequestInit?]>();
  const getCredentials = jest.fn().mockResolvedValue({ token: 'dex-id-token' });
  const client = new PlansApiClient({
    discoveryApi: { getBaseUrl: jest.fn().mockResolvedValue(BASE_URL) },
    fetchApi: { fetch: fetchMock as unknown as typeof fetch },
    authApi: { getCredentials },
  });

  beforeEach(() => {
    fetchMock.mockReset();
    getCredentials.mockClear();
    getCredentials.mockResolvedValue({ token: 'dex-id-token' });
  });

  it("forwards the caller's muster token on every request", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ repositories: [] }));

    await client.listRepos();

    expect(getCredentials).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(`${BASE_URL}/repos`, AUTHED);
  });

  it('sends no token header when the session has none', async () => {
    getCredentials.mockResolvedValue({});
    fetchMock.mockResolvedValue(jsonResponse({ repositories: [] }));

    await client.listRepos();

    expect(fetchMock).toHaveBeenCalledWith(`${BASE_URL}/repos`, {
      headers: {},
    });
  });

  it('lists repositories', async () => {
    const payload = { repositories: ['giantswarm/bumblebee-plans'] };
    fetchMock.mockResolvedValue(jsonResponse(payload));

    await expect(client.listRepos()).resolves.toEqual(payload);
  });

  it('reads the connection state', async () => {
    const payload = {
      connected: false,
      authUrl: 'https://muster/oauth/proxy/start?state=x',
    };
    fetchMock.mockResolvedValue(jsonResponse(payload));

    await expect(client.getConnection()).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(`${BASE_URL}/connection`, AUTHED);
  });

  it('lists pulls without a repo parameter', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ pulls: [] }));

    await client.listPulls();

    expect(fetchMock).toHaveBeenCalledWith(`${BASE_URL}/pulls`, AUTHED);
  });

  it('passes the repo parameter URL-encoded', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ pulls: [] }));

    await client.listPulls('giantswarm/bumblebee-plans');

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/pulls?repo=giantswarm%2Fbumblebee-plans`,
      AUTHED,
    );
  });

  it('fetches pull files by number', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ files: [] }));

    await client.listPullFiles(42);

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/pulls/42/files`,
      AUTHED,
    );
  });

  it('fetches the tree for a ref', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ truncated: false, tree: [] }));

    await client.getTree('plan/x');

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/tree?ref=plan%2Fx`,
      AUTHED,
    );
  });

  it('fetches file content with path and ref', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ path: 'a/PRD.md', ref: 'main', content: '# x' }),
    );

    await client.getContent('a/PRD.md', 'main');

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/content?path=a%2FPRD.md&ref=main`,
      AUTHED,
    );
  });

  it('creates a discussion comment', async () => {
    const comment = { id: 9, author: 'alice', body: 'Hi' };
    fetchMock.mockResolvedValue(jsonResponse({ comment }, 201));

    await expect(client.createPullComment(42, 'Hi')).resolves.toEqual(comment);

    expect(fetchMock).toHaveBeenCalledWith(`${BASE_URL}/pulls/42/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...AUTHED.headers },
      body: JSON.stringify({ body: 'Hi' }),
    });
  });

  it('creates an inline review comment', async () => {
    const comment = { id: 10, body: 'Consider', path: 'a/PRD.md', line: 3 };
    fetchMock.mockResolvedValue(jsonResponse({ comment }, 201));

    await expect(
      client.createReviewComment(42, {
        body: 'Consider',
        path: 'a/PRD.md',
        line: 3,
      }),
    ).resolves.toEqual(comment);

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/pulls/42/review-comments`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...AUTHED.headers },
        body: JSON.stringify({ body: 'Consider', path: 'a/PRD.md', line: 3 }),
      },
    );
  });

  it('surfaces a missing GitHub grant as GithubNotConnectedError with the sign-in URL', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: {
            name: 'GithubNotConnectedError',
            message:
              'Connect your GitHub account to muster to use the plans page.',
            authUrl: 'https://muster/oauth/proxy/start?state=x',
          },
        },
        401,
      ),
    );

    const error = await client.listPulls().catch(e => e);

    expect(error).toBeInstanceOf(GithubNotConnectedError);
    expect(error.name).toBe('GithubNotConnectedError');
    expect(error.authUrl).toBe('https://muster/oauth/proxy/start?state=x');
    expect(error.message).toMatch(/Connect your GitHub account/);
  });

  it('surfaces the backend error message with a status-based name', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { message: 'no access' } }, 403),
    );

    await expect(client.listPulls()).rejects.toMatchObject({
      name: 'ForbiddenError',
      message: 'no access',
    });
  });

  it('falls back to a generic message on a non-JSON error body', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error('not json');
      },
    } as unknown as Response);

    await expect(client.listPulls()).rejects.toThrow(
      'Plans request failed with status 502',
    );
  });
});
