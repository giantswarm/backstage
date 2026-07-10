import { MiddlewareFactory } from '@backstage/backend-defaults/rootHttpRouter';
import { mockServices } from '@backstage/backend-test-utils';
import { AuthenticationError } from '@backstage/errors';
import { GithubCredentialsProvider } from '@backstage/integration';
import express from 'express';
import request from 'supertest';
import { createRouter, RouterOptions } from './router';

const REPO = 'giantswarm/bumblebee-plans';

/** Minimal Response stand-in for the mocked fetch. */
function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe('createRouter', () => {
  const fetchFn = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
  const getCredentials = jest.fn();
  const credentialsProvider = {
    getCredentials,
  } as unknown as GithubCredentialsProvider;

  // Mirror the production setup: the backend's root HTTP router applies
  // MiddlewareFactory.error() after plugin routes, mapping @backstage/errors
  // classes to status codes.
  async function buildApp(
    repositories: string[] = [REPO],
    options: Partial<RouterOptions> = {},
  ) {
    const logger = mockServices.logger.mock();
    const config = mockServices.rootConfig({
      data: repositories.length > 0 ? { plans: { repositories } } : {},
    });
    const router = await createRouter({
      logger,
      config,
      httpAuth: mockServices.httpAuth(),
      userInfo: mockServices.userInfo(),
      credentialsProvider,
      fetchFn,
      ...options,
    });
    const app = express();
    app.use(router);
    app.use(MiddlewareFactory.create({ logger, config }).error());
    return app;
  }

  let app: express.Express;

  beforeEach(async () => {
    fetchFn.mockReset();
    getCredentials.mockReset();
    getCredentials.mockResolvedValue({ token: 'gh-token' });
    app = await buildApp();
  });

  it('rejects an invalid repository slug in config', async () => {
    await expect(buildApp(['not a slug'])).rejects.toThrow(
      "Invalid plans.repositories entry 'not a slug'",
    );
  });

  it('lists configured repositories', async () => {
    const response = await request(app).get('/repos');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ repositories: [REPO] });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('returns 503 when no repository is configured', async () => {
    const unconfiguredApp = await buildApp([]);

    const repos = await request(unconfiguredApp).get('/repos');
    expect(repos.status).toBe(200);
    expect(repos.body).toEqual({ repositories: [] });

    const response = await request(unconfiguredApp).get('/pulls');
    expect(response.status).toBe(503);
    expect(response.body.error.name).toBe('ServiceUnavailableError');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('rejects requests without a Backstage user', async () => {
    const credentials = jest
      .fn()
      .mockRejectedValue(new AuthenticationError('missing credentials'));
    const unauthedApp = await buildApp([REPO], {
      httpAuth: { credentials } as unknown as RouterOptions['httpAuth'],
    });

    const response = await request(unauthedApp).get('/repos');

    expect(response.status).toBe(401);
    expect(credentials).toHaveBeenCalledWith(expect.anything(), {
      allow: ['user'],
    });
  });

  describe('/pulls', () => {
    it('maps open pull requests', async () => {
      fetchFn.mockResolvedValue(
        jsonResponse([
          {
            number: 7,
            title: 'Agent platform MVP',
            user: { login: 'teemow' },
            draft: true,
            head: { ref: 'agent-platform-mvp' },
            updated_at: '2026-07-03T10:00:00Z',
            body: 'Plan body',
          },
          { number: 8, title: 'No optional fields' },
        ]),
      );

      const response = await request(app).get('/pulls');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        pulls: [
          {
            number: 7,
            title: 'Agent platform MVP',
            author: 'teemow',
            draft: true,
            branch: 'agent-platform-mvp',
            updatedAt: '2026-07-03T10:00:00Z',
            body: 'Plan body',
          },
          { number: 8, title: 'No optional fields', draft: false, body: '' },
        ],
      });
      expect(fetchFn).toHaveBeenCalledWith(
        `https://api.github.com/repos/${REPO}/pulls?state=open&per_page=100`,
        {
          headers: expect.objectContaining({
            Authorization: 'Bearer gh-token',
          }),
        },
      );
    });

    it('proceeds without Authorization when credentials fail', async () => {
      getCredentials.mockRejectedValue(new Error('no app installation'));
      fetchFn.mockResolvedValue(jsonResponse([]));

      const response = await request(app).get('/pulls');

      expect(response.status).toBe(200);
      const headers = fetchFn.mock.calls[0][1]?.headers as Record<
        string,
        string
      >;
      expect(headers.Authorization).toBeUndefined();
    });

    it('maps a GitHub 404 to NotFoundError', async () => {
      fetchFn.mockResolvedValue(jsonResponse({}, 404));

      const response = await request(app).get('/pulls');

      expect(response.status).toBe(404);
      expect(response.body.error.name).toBe('NotFoundError');
    });

    it('fails on other GitHub errors', async () => {
      fetchFn.mockResolvedValue(jsonResponse({}, 500));

      const response = await request(app).get('/pulls');

      expect(response.status).toBe(500);
    });

    it('maps a GitHub 403 to NotAllowedError and surfaces its message', async () => {
      fetchFn.mockResolvedValue(
        jsonResponse(
          { message: 'Resource not accessible by integration' },
          403,
        ),
      );

      const response = await request(app).get('/pulls');

      expect(response.status).toBe(403);
      expect(response.body.error.name).toBe('NotAllowedError');
      expect(response.body.error.message).toContain(
        'Resource not accessible by integration',
      );
    });
  });

  describe('repo resolution', () => {
    const OTHER_REPO = 'giantswarm/other-plans';

    it('requires repo when several repositories are configured', async () => {
      const multiApp = await buildApp([REPO, OTHER_REPO]);

      const response = await request(multiApp).get('/pulls');

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('repo query parameter');
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('routes to the requested configured repository', async () => {
      const multiApp = await buildApp([REPO, OTHER_REPO]);
      fetchFn.mockResolvedValue(jsonResponse([]));

      const response = await request(multiApp).get(
        `/pulls?repo=${encodeURIComponent(OTHER_REPO)}`,
      );

      expect(response.status).toBe(200);
      expect(fetchFn).toHaveBeenCalledWith(
        expect.stringContaining(`/repos/${OTHER_REPO}/pulls`),
        expect.anything(),
      );
    });

    it('rejects an unconfigured repository', async () => {
      const response = await request(app).get(
        '/pulls?repo=giantswarm/arbitrary',
      );

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('giantswarm/arbitrary');
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('rejects a repeated repo parameter', async () => {
      const response = await request(app).get(
        `/pulls?repo=${REPO}&repo=${REPO}`,
      );

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('at most once');
      expect(fetchFn).not.toHaveBeenCalled();
    });
  });

  describe('/pulls/:number/files', () => {
    it('maps changed files', async () => {
      fetchFn.mockResolvedValue(
        jsonResponse([
          {
            filename: 'plans/mvp/index.md',
            status: 'modified',
            additions: 3,
            deletions: 1,
            patch: '@@ -1 +1,3 @@',
            previous_filename: 'plans/mvp/README.md',
          },
          { filename: 'assets/big.png', status: 'added' },
        ]),
      );

      const response = await request(app).get('/pulls/7/files');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        files: [
          {
            filename: 'plans/mvp/index.md',
            status: 'modified',
            additions: 3,
            deletions: 1,
            patch: '@@ -1 +1,3 @@',
            previousFilename: 'plans/mvp/README.md',
          },
          {
            filename: 'assets/big.png',
            status: 'added',
            additions: 0,
            deletions: 0,
          },
        ],
      });
      expect(fetchFn).toHaveBeenCalledWith(
        `https://api.github.com/repos/${REPO}/pulls/7/files?per_page=100`,
        expect.anything(),
      );
    });

    it('rejects a non-numeric pull number', async () => {
      const response = await request(app).get('/pulls/abc/files');

      expect(response.status).toBe(400);
      expect(fetchFn).not.toHaveBeenCalled();
    });
  });

  describe('/pulls/:number/comments', () => {
    it('maps discussion comments', async () => {
      fetchFn.mockResolvedValue(
        jsonResponse([
          {
            id: 1,
            user: { login: 'teemow' },
            body: 'Looks good',
            created_at: '2026-07-07T10:00:00Z',
            html_url: `https://github.com/${REPO}/pull/7#issuecomment-1`,
          },
        ]),
      );

      const response = await request(app).get('/pulls/7/comments');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        comments: [
          {
            id: 1,
            author: 'teemow',
            body: 'Looks good',
            createdAt: '2026-07-07T10:00:00Z',
            htmlUrl: `https://github.com/${REPO}/pull/7#issuecomment-1`,
          },
        ],
      });
      expect(fetchFn).toHaveBeenCalledWith(
        `https://api.github.com/repos/${REPO}/issues/7/comments?per_page=100`,
        expect.anything(),
      );
    });

    it('creates a comment attributed to the Backstage user', async () => {
      fetchFn.mockResolvedValue(
        jsonResponse({ id: 2, user: { login: 'plans-app[bot]' } }, 201),
      );

      const response = await request(app)
        .post('/pulls/7/comments')
        .send({ body: 'A remark' });

      expect(response.status).toBe(201);
      expect(response.body.comment.id).toBe(2);
      expect(fetchFn).toHaveBeenCalledWith(
        `https://api.github.com/repos/${REPO}/issues/7/comments`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            body: '**mock** (via Dev Portal):\n\nA remark',
          }),
        }),
      );
    });

    it('rejects an empty body', async () => {
      const response = await request(app)
        .post('/pulls/7/comments')
        .send({ body: '  ' });

      expect(response.status).toBe(400);
      expect(fetchFn).not.toHaveBeenCalled();
    });
  });

  describe('/pulls/:number/review-comments', () => {
    it('maps inline comments including line position', async () => {
      fetchFn.mockResolvedValue(
        jsonResponse([
          {
            id: 10,
            user: { login: 'teemow' },
            body: 'Inline remark',
            created_at: '2026-07-07T10:00:00Z',
            path: 'plans/mvp/index.md',
            line: 12,
            side: 'RIGHT',
          },
          {
            id: 11,
            body: 'Reply',
            path: 'plans/mvp/index.md',
            line: null,
            original_line: 12,
            in_reply_to_id: 10,
          },
        ]),
      );

      const response = await request(app).get('/pulls/7/review-comments');

      expect(response.status).toBe(200);
      expect(response.body.comments).toEqual([
        expect.objectContaining({
          id: 10,
          author: 'teemow',
          path: 'plans/mvp/index.md',
          line: 12,
          side: 'RIGHT',
        }),
        expect.objectContaining({ id: 11, line: 12, inReplyTo: 10 }),
      ]);
      expect(fetchFn).toHaveBeenCalledWith(
        `https://api.github.com/repos/${REPO}/pulls/7/comments?per_page=100`,
        expect.anything(),
      );
    });

    it('creates an inline comment on the PR head commit', async () => {
      fetchFn
        .mockResolvedValueOnce(jsonResponse({ head: { sha: 'abc123' } }))
        .mockResolvedValueOnce(
          jsonResponse({ id: 12, path: 'plans/mvp/index.md', line: 3 }, 201),
        );

      const response = await request(app)
        .post('/pulls/7/review-comments')
        .send({ body: 'On this line', path: 'plans/mvp/index.md', line: 3 });

      expect(response.status).toBe(201);
      expect(response.body.comment.id).toBe(12);
      expect(fetchFn).toHaveBeenNthCalledWith(
        1,
        `https://api.github.com/repos/${REPO}/pulls/7`,
        expect.anything(),
      );
      expect(fetchFn).toHaveBeenNthCalledWith(
        2,
        `https://api.github.com/repos/${REPO}/pulls/7/comments`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            body: '**mock** (via Dev Portal):\n\nOn this line',
            commit_id: 'abc123',
            path: 'plans/mvp/index.md',
            line: 3,
            side: 'RIGHT',
          }),
        }),
      );
    });

    it('creates a reply without needing path or line', async () => {
      fetchFn.mockResolvedValue(jsonResponse({ id: 13 }, 201));

      const response = await request(app)
        .post('/pulls/7/review-comments')
        .send({ body: 'A reply', inReplyTo: 10 });

      expect(response.status).toBe(201);
      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(fetchFn).toHaveBeenCalledWith(
        `https://api.github.com/repos/${REPO}/pulls/7/comments`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            body: '**mock** (via Dev Portal):\n\nA reply',
            in_reply_to: 10,
          }),
        }),
      );
    });

    it('rejects a new thread without path and line', async () => {
      const response = await request(app)
        .post('/pulls/7/review-comments')
        .send({ body: 'Missing position' });

      expect(response.status).toBe(400);
      expect(fetchFn).not.toHaveBeenCalled();
    });
  });

  describe('/tree', () => {
    it('defaults to HEAD and maps entries', async () => {
      fetchFn.mockResolvedValue(
        jsonResponse({
          truncated: false,
          tree: [
            { path: 'plans', type: 'tree' },
            { path: 'plans/mvp/index.md', type: 'blob', size: 1234 },
          ],
        }),
      );

      const response = await request(app).get('/tree');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        truncated: false,
        tree: [
          { path: 'plans', type: 'tree' },
          { path: 'plans/mvp/index.md', type: 'blob', size: 1234 },
        ],
      });
      expect(fetchFn).toHaveBeenCalledWith(
        `https://api.github.com/repos/${REPO}/git/trees/HEAD?recursive=1`,
        expect.anything(),
      );
    });

    it('encodes the requested ref', async () => {
      fetchFn.mockResolvedValue(jsonResponse({ tree: [] }));

      await request(app).get('/tree?ref=feature/branch');

      expect(fetchFn).toHaveBeenCalledWith(
        `https://api.github.com/repos/${REPO}/git/trees/feature%2Fbranch?recursive=1`,
        expect.anything(),
      );
    });
  });

  describe('/content', () => {
    it('requires the path parameter', async () => {
      const response = await request(app).get('/content');

      expect(response.status).toBe(400);
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('decodes base64 file content', async () => {
      fetchFn.mockResolvedValue(
        jsonResponse({
          type: 'file',
          encoding: 'base64',
          content: Buffer.from('# Plan\n', 'utf8').toString('base64'),
        }),
      );

      const response = await request(app).get(
        '/content?path=plans/mvp/index.md&ref=agent-platform-mvp',
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        path: 'plans/mvp/index.md',
        ref: 'agent-platform-mvp',
        content: '# Plan\n',
      });
      expect(fetchFn).toHaveBeenCalledWith(
        `https://api.github.com/repos/${REPO}/contents/plans/mvp/index.md?ref=agent-platform-mvp`,
        expect.anything(),
      );
    });

    it('rejects a directory path', async () => {
      fetchFn.mockResolvedValue(jsonResponse({ type: 'dir' }));

      const response = await request(app).get('/content?path=plans');

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('not a file');
    });

    it('fails on unexpected content encoding', async () => {
      fetchFn.mockResolvedValue(
        jsonResponse({ type: 'file', encoding: 'none', content: 'raw' }),
      );

      const response = await request(app).get('/content?path=plans/index.md');

      expect(response.status).toBe(500);
    });
  });

  describe('/epics', () => {
    const contentResponse = (markdown: string) =>
      jsonResponse({
        type: 'file',
        encoding: 'base64',
        content: Buffer.from(markdown, 'utf8').toString('base64'),
      });

    /** Route the mocked fetch by URL suffix, like the real GitHub API. */
    function mockGithub(routes: Record<string, Response>) {
      fetchFn.mockImplementation(async url => {
        for (const [suffix, response] of Object.entries(routes)) {
          if (String(url).endsWith(suffix)) {
            return response;
          }
        }
        return jsonResponse({ message: 'Not Found' }, 404);
      });
    }

    it('parses Epic headers from merged plans and open PRs', async () => {
      mockGithub({
        '/git/trees/HEAD?recursive=1': jsonResponse({
          tree: [
            { path: 'agent-platform-mvp/PRD.md', type: 'blob' },
            { path: 'agent-platform-mvp/index.html', type: 'blob' },
            { path: 'no-epic-plan/index.md', type: 'blob' },
            { path: 'README.md', type: 'blob' },
            { path: 'deep/nested/doc.md', type: 'blob' },
          ],
        }),
        '/contents/agent-platform-mvp/PRD.md?ref=HEAD': contentResponse(
          '# PRD: Agent Platform MVP\n\n' +
            '**Epic:** [giantswarm/giantswarm#36625](https://github.com/giantswarm/giantswarm/issues/36625)\n',
        ),
        '/contents/no-epic-plan/index.md?ref=HEAD':
          contentResponse('# No epic here\n'),
        '/pulls?state=open&per_page=100': jsonResponse([
          { number: 9, title: 'Add obo plan' },
          { number: 3, title: 'No plan doc' },
        ]),
        '/pulls/9/files?per_page=100': jsonResponse([
          {
            filename: 'slack-to-github-obo/PRD.md',
            patch:
              '@@ -0,0 +1,3 @@\n+# PRD\n+\n+**Epic**: https://github.com/giantswarm/giantswarm/issues/36700\n',
          },
        ]),
        '/pulls/3/files?per_page=100': jsonResponse([
          { filename: 'README.md', patch: '' },
        ]),
      });

      const response = await request(app).get('/epics');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        merged: [
          {
            folder: 'agent-platform-mvp',
            path: 'agent-platform-mvp/PRD.md',
            epic: {
              owner: 'giantswarm',
              repo: 'giantswarm',
              number: 36625,
              url: 'https://github.com/giantswarm/giantswarm/issues/36625',
            },
          },
        ],
        pulls: [
          {
            number: 9,
            title: 'Add obo plan',
            epic: {
              owner: 'giantswarm',
              repo: 'giantswarm',
              number: 36700,
              url: 'https://github.com/giantswarm/giantswarm/issues/36700',
            },
          },
        ],
      });
    });

    it('caches the scan between requests', async () => {
      mockGithub({
        '/git/trees/HEAD?recursive=1': jsonResponse({ tree: [] }),
        '/pulls?state=open&per_page=100': jsonResponse([]),
      });

      await request(app).get('/epics');
      await request(app).get('/epics');

      expect(fetchFn).toHaveBeenCalledTimes(2);
    });

    it('skips plans whose documents cannot be read', async () => {
      mockGithub({
        '/git/trees/HEAD?recursive=1': jsonResponse({
          tree: [{ path: 'broken-plan/PRD.md', type: 'blob' }],
        }),
        '/pulls?state=open&per_page=100': jsonResponse([]),
      });

      const response = await request(app).get('/epics');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ merged: [], pulls: [] });
    });
  });
});
