import {
  MusterServerNotConnectedError,
  RoadmapApiClient,
} from './RoadmapApiClient';

const BASE_URL = 'http://backstage/api/roadmap';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

/** Every request, reads included, carries the caller's muster token. */
const AUTHED = {
  headers: { 'backstage-muster-authorization': 'dex-id-token' },
};

describe('RoadmapApiClient', () => {
  const fetchMock = jest.fn<Promise<Response>, [string, RequestInit?]>();
  const getCredentials = jest.fn().mockResolvedValue({ token: 'dex-id-token' });
  const client = new RoadmapApiClient({
    discoveryApi: { getBaseUrl: jest.fn().mockResolvedValue(BASE_URL) },
    fetchApi: { fetch: fetchMock as unknown as typeof fetch },
    authApi: { getCredentials },
  });

  beforeEach(() => {
    fetchMock.mockReset();
    getCredentials.mockClear();
    getCredentials.mockResolvedValue({ token: 'dex-id-token' });
  });

  it('fetches the schema as the caller', async () => {
    const payload = { board: 'roadmap', defaultTeams: [], fields: [] };
    fetchMock.mockResolvedValue(jsonResponse(payload));

    await expect(client.getSchema()).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(`${BASE_URL}/schema`, AUTHED);
    expect(getCredentials).toHaveBeenCalledTimes(1);
  });

  it('sends no token header when the session has none', async () => {
    getCredentials.mockResolvedValue({});
    fetchMock.mockResolvedValue(jsonResponse({ items: [] }));

    await client.listItems();

    expect(fetchMock).toHaveBeenCalledWith(`${BASE_URL}/items`, {
      headers: {},
    });
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

  it('passes filters URL-encoded and drops empty values', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [] }));

    await client.listItems({ team: 'Bumblebee🐝', status: '', keyword: 'a b' });

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/items?team=Bumblebee%F0%9F%90%9D&keyword=a+b`,
      AUTHED,
    );
  });

  it('fetches item detail by encoded id', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ item: {} }));

    await client.getItem('PVTI/1');

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/items/PVTI%2F1`,
      AUTHED,
    );
  });

  it('fetches sub-issues', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ subIssues: [], parent: null }));

    await client.listSubIssues('giantswarm', 'giantswarm', 45);

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/issues/giantswarm/giantswarm/45/sub-issues`,
      AUTHED,
    );
  });

  it('sends field updates as the caller', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'ok' }));

    await client.updateItemField('PVTI_1', 'Status', 'Done ✅');

    expect(fetchMock).toHaveBeenCalledWith(`${BASE_URL}/items/PVTI_1/field`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...AUTHED.headers },
      body: JSON.stringify({ name: 'Status', value: 'Done ✅' }),
    });
  });

  it('links and unlinks sub-issues, tolerating the 204 response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ parent: {} }, 201));
    await client.addSubIssue(
      'giantswarm',
      'giantswarm',
      45,
      'giantswarm/giantswarm#46',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/issues/giantswarm/giantswarm/45/sub-issues`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...AUTHED.headers },
        body: JSON.stringify({ child: 'giantswarm/giantswarm#46' }),
      },
    );

    fetchMock.mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => undefined,
    } as Response);
    await expect(
      client.removeSubIssue('giantswarm', 'giantswarm', 45, 7),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenLastCalledWith(
      `${BASE_URL}/issues/giantswarm/giantswarm/45/sub-issues/7`,
      { method: 'DELETE', headers: AUTHED.headers },
    );
  });

  it('surfaces a missing grant as MusterServerNotConnectedError with the sign-in URL', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: {
            name: 'MusterServerNotConnectedError',
            message: "Connect 'gazelle-mcp-pro' in muster to use this page.",
            server: 'gazelle-mcp-pro',
            authUrl: 'https://muster/oauth/proxy/start?state=x',
          },
        },
        401,
      ),
    );

    const error = await client.getSchema().catch(e => e);

    expect(error).toBeInstanceOf(MusterServerNotConnectedError);
    expect(error.authUrl).toBe('https://muster/oauth/proxy/start?state=x');
  });

  it('surfaces the backend error message with a status-based name', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { message: 'no access' } }, 403),
    );

    await expect(client.getSchema()).rejects.toMatchObject({
      name: 'ForbiddenError',
      message: 'no access',
    });
  });
});
