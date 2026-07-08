import { PlansApiClient } from './PlansApiClient';

const BASE_URL = 'http://backstage/api/plans';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('PlansApiClient', () => {
  const fetchMock = jest.fn<Promise<Response>, [string]>();
  const client = new PlansApiClient({
    discoveryApi: { getBaseUrl: jest.fn().mockResolvedValue(BASE_URL) },
    fetchApi: { fetch: fetchMock as unknown as typeof fetch },
  });

  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('lists repositories', async () => {
    const payload = { repositories: ['giantswarm/bumblebee-plans'] };
    fetchMock.mockResolvedValue(jsonResponse(payload));

    await expect(client.listRepos()).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(`${BASE_URL}/repos`);
  });

  it('lists pulls without a repo parameter', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ pulls: [] }));

    await client.listPulls();

    expect(fetchMock).toHaveBeenCalledWith(`${BASE_URL}/pulls`);
  });

  it('passes the repo parameter URL-encoded', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ pulls: [] }));

    await client.listPulls('giantswarm/bumblebee-plans');

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/pulls?repo=giantswarm%2Fbumblebee-plans`,
    );
  });

  it('fetches pull files by number', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ files: [] }));

    await client.listPullFiles(7, 'giantswarm/bumblebee-plans');

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/pulls/7/files?repo=giantswarm%2Fbumblebee-plans`,
    );
  });

  it('fetches the tree for a ref', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ truncated: false, tree: [] }));

    await client.getTree('main');

    expect(fetchMock).toHaveBeenCalledWith(`${BASE_URL}/tree?ref=main`);
  });

  it('fetches file content with path and ref', async () => {
    const payload = { path: 'plans/index.md', ref: 'main', content: '# Plan' };
    fetchMock.mockResolvedValue(jsonResponse(payload));

    await expect(
      client.getContent('plans/index.md', 'main'),
    ).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/content?path=plans%2Findex.md&ref=main`,
    );
  });

  it('lists discussion comments for a pull', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ comments: [] }));

    await client.listPullComments(7, 'giantswarm/bumblebee-plans');

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/pulls/7/comments?repo=giantswarm%2Fbumblebee-plans`,
    );
  });

  it('creates a discussion comment', async () => {
    const comment = { id: 1, body: 'A remark' };
    fetchMock.mockResolvedValue(jsonResponse({ comment }, 201));

    await expect(client.createPullComment(7, 'A remark')).resolves.toEqual(
      comment,
    );
    expect(fetchMock).toHaveBeenCalledWith(`${BASE_URL}/pulls/7/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: 'A remark' }),
    });
  });

  it('lists review comments for a pull', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ comments: [] }));

    await client.listReviewComments(7);

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/pulls/7/review-comments`,
    );
  });

  it('creates an inline review comment', async () => {
    const comment = { id: 2, body: 'On this line' };
    fetchMock.mockResolvedValue(jsonResponse({ comment }, 201));

    await expect(
      client.createReviewComment(7, {
        body: 'On this line',
        path: 'plans/index.md',
        line: 3,
      }),
    ).resolves.toEqual(comment);
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/pulls/7/review-comments`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: 'On this line',
          path: 'plans/index.md',
          line: 3,
        }),
      },
    );
  });

  it('surfaces the backend error message', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { name: 'InputError', message: 'repo query required' } },
        400,
      ),
    );

    await expect(client.listPulls()).rejects.toThrow('repo query required');
  });

  it.each([
    [401, 'UnauthorizedError'],
    [403, 'ForbiddenError'],
    [404, 'NotFoundError'],
    [503, 'ServiceUnavailableError'],
  ])('names errors for status %i', async (status, name) => {
    fetchMock.mockResolvedValue(jsonResponse({}, status));

    await expect(client.listRepos()).rejects.toMatchObject({
      name,
      message: `Plans request failed with status ${status}`,
    });
  });

  it('falls back to a generic message on a non-JSON error body', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not json');
      },
    } as unknown as Response);

    await expect(client.listRepos()).rejects.toThrow(
      'Plans request failed with status 500',
    );
  });
});
