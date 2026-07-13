import { RoadmapApiClient } from './RoadmapApiClient';

const BASE_URL = 'http://backstage/api/roadmap';
const USER_TOKEN = 'gho_user-token';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('RoadmapApiClient', () => {
  const fetchMock = jest.fn<Promise<Response>, [string]>();
  const getAccessToken = jest.fn().mockResolvedValue(USER_TOKEN);
  const client = new RoadmapApiClient({
    discoveryApi: { getBaseUrl: jest.fn().mockResolvedValue(BASE_URL) },
    fetchApi: { fetch: fetchMock as unknown as typeof fetch },
    githubAuthApi: { getAccessToken } as any,
  });

  beforeEach(() => {
    fetchMock.mockReset();
    getAccessToken.mockClear();
  });

  it('fetches the schema', async () => {
    const payload = { board: 'roadmap', defaultTeams: [], fields: [] };
    fetchMock.mockResolvedValue(jsonResponse(payload));

    await expect(client.getSchema()).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(`${BASE_URL}/schema`);
    expect(getAccessToken).not.toHaveBeenCalled();
  });

  it('lists items without filters', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [] }));

    await client.listItems();

    expect(fetchMock).toHaveBeenCalledWith(`${BASE_URL}/items`);
  });

  it('passes filters URL-encoded and drops empty values', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [] }));

    await client.listItems({
      team: 'Bumblebee🐝',
      kind: 'Epic 🎯',
      keyword: '',
    });

    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe('/api/roadmap/items');
    expect(url.searchParams.get('team')).toBe('Bumblebee🐝');
    expect(url.searchParams.get('kind')).toBe('Epic 🎯');
    expect(url.searchParams.has('keyword')).toBe(false);
  });

  it('fetches item detail by encoded id', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ item: {} }));

    await client.getItem('PVTI_abc/123');

    expect(fetchMock).toHaveBeenCalledWith(`${BASE_URL}/items/PVTI_abc%2F123`);
  });

  it('fetches the overview with a team filter', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ total: 0, byStatus: {}, byRepo: {} }),
    );

    await client.getOverview('Bumblebee🐝');

    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe('/api/roadmap/overview');
    expect(url.searchParams.get('team')).toBe('Bumblebee🐝');
  });

  it('fetches sub-issues', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ subIssues: [], parent: null }));

    await client.listSubIssues('giantswarm', 'giantswarm', 35000);

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/issues/giantswarm/giantswarm/35000/sub-issues`,
    );
  });

  it('sends field updates with the user GitHub token', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'ok' }));

    await client.updateItemField('PVTI_abc', 'Status', 'In Progress ⛏️');

    expect(getAccessToken).toHaveBeenCalledWith(['repo', 'project']);
    expect(fetchMock).toHaveBeenCalledWith(`${BASE_URL}/items/PVTI_abc/field`, {
      method: 'PATCH',
      headers: {
        'X-GitHub-Token': USER_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Status', value: 'In Progress ⛏️' }),
    });
  });

  it('links a sub-issue with the user GitHub token', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ parent: {} }, 201));

    await client.addSubIssue(
      'giantswarm',
      'giantswarm',
      35000,
      'giantswarm/roadmap#42',
    );

    expect(getAccessToken).toHaveBeenCalledWith(['repo', 'project']);
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/issues/giantswarm/giantswarm/35000/sub-issues`,
      {
        method: 'POST',
        headers: {
          'X-GitHub-Token': USER_TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ child: 'giantswarm/roadmap#42' }),
      },
    );
  });

  it('unlinks a sub-issue and tolerates the 204 response', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => {
        throw new Error('no body');
      },
    } as unknown as Response);

    await expect(
      client.removeSubIssue('giantswarm', 'giantswarm', 35000, 1001),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/issues/giantswarm/giantswarm/35000/sub-issues/1001`,
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('surfaces the backend error message', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { name: 'InputError', message: 'unknown field' } },
        400,
      ),
    );

    await expect(
      client.updateItemField('PVTI_abc', 'Nope', 'x'),
    ).rejects.toThrow('unknown field');
  });

  it.each([
    [401, 'UnauthorizedError'],
    [403, 'ForbiddenError'],
    [404, 'NotFoundError'],
    [503, 'ServiceUnavailableError'],
  ])('names errors for status %i', async (status, name) => {
    fetchMock.mockResolvedValue(jsonResponse({}, status));

    await expect(client.getSchema()).rejects.toMatchObject({
      name,
      message: `Roadmap request failed with status ${status}`,
    });
  });
});
