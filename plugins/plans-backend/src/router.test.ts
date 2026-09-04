import { MiddlewareFactory } from '@backstage/backend-defaults/rootHttpRouter';
import { mockServices } from '@backstage/backend-test-utils';
import { AuthenticationError } from '@backstage/errors';
import {
  AuthLoginResult,
  McpContentItem,
  MusterServerGateway,
} from '@giantswarm/backstage-plugin-gs-node';
import express from 'express';
import request from 'supertest';
import { createRouter, RouterOptions } from './router';

const REPO = 'giantswarm/bumblebee-plans';
const TOKEN_HEADER = 'backstage-muster-authorization';

type Call = { tool: string; args: Record<string, unknown>; authToken: string };

/**
 * GitHub-through-muster stand-in: answers are keyed by tool name (a function
 * gets the args), every call is recorded, and `notConnected` makes the first
 * call fail the way muster does for a session without a grant.
 */
class FakeGateway implements MusterServerGateway {
  readonly server = 'github';
  calls: Call[] = [];
  answers = new Map<
    string,
    unknown | ((args: Record<string, unknown>) => unknown)
  >();
  contentAnswers = new Map<string, McpContentItem[]>();
  loginResult: AuthLoginResult = {
    status: 'connected',
    message: 'Already Connected',
  };
  failNextCallsWith?: Error;
  logins = 0;

  private answer(tool: string, args: Record<string, unknown>) {
    if (this.failNextCallsWith) {
      const error = this.failNextCallsWith;
      this.failNextCallsWith = undefined;
      throw error;
    }
    const answer = this.answers.get(tool);
    if (answer === undefined) {
      throw new Error(`FakeGateway: no answer for ${tool}`);
    }
    return typeof answer === 'function' ? answer(args) : answer;
  }

  async call(tool: string, args: Record<string, unknown>, authToken: string) {
    this.calls.push({ tool, args, authToken });
    return this.answer(tool, args);
  }

  async callContent(
    tool: string,
    args: Record<string, unknown>,
    authToken: string,
  ) {
    this.calls.push({ tool, args, authToken });
    if (this.failNextCallsWith) {
      const error = this.failNextCallsWith;
      this.failNextCallsWith = undefined;
      throw error;
    }
    const content =
      this.contentAnswers.get(`${tool}:${args.path}`) ??
      this.contentAnswers.get(tool);
    if (!content) {
      throw new Error(`FakeGateway: no content for ${tool} ${args.path}`);
    }
    return content;
  }

  async login() {
    this.logins++;
    return this.loginResult;
  }
}

const fileContent = (text: string): McpContentItem[] => [
  { type: 'text', text: 'successfully downloaded text file (SHA: abc)' },
  {
    type: 'resource',
    resource: { uri: 'repo://x', mimeType: 'text/plain', text },
  },
];

describe('createRouter', () => {
  let github: FakeGateway;

  async function buildApp(
    repositories: string[] = [REPO],
    options: Partial<RouterOptions> = {},
    { withToken = true }: { withToken?: boolean } = {},
  ) {
    const logger = mockServices.logger.mock();
    const config = mockServices.rootConfig({
      data: repositories.length > 0 ? { plans: { repositories } } : {},
    });
    const router = await createRouter({
      logger,
      config,
      httpAuth: mockServices.httpAuth(),
      github,
      ...options,
    });
    const app = express();
    if (withToken) {
      app.use((req, _res, next) => {
        req.headers[TOKEN_HEADER] = 'dex-id-token';
        next();
      });
    }
    app.use(router);
    app.use(MiddlewareFactory.create({ logger, config }).error());
    return app;
  }

  let app: express.Express;

  beforeEach(async () => {
    github = new FakeGateway();
    app = await buildApp();
  });

  it('rejects an invalid repository slug in config', async () => {
    await expect(buildApp(['not-a-slug'])).rejects.toThrow(
      /Invalid plans.repositories entry/,
    );
  });

  it('lists configured repositories without touching GitHub', async () => {
    const res = await request(app).get('/repos');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ repositories: [REPO] });
    expect(github.calls).toHaveLength(0);
  });

  it('returns 503 when no repository is configured', async () => {
    const res = await request(await buildApp([])).get('/pulls');
    expect(res.status).toBe(503);
  });

  it('returns 503 when muster is not configured', async () => {
    const res = await request(
      await buildApp([REPO], { github: undefined }),
    ).get('/pulls');
    expect(res.status).toBe(503);
    expect(res.body.error.message).toMatch(/plans\.muster/);
  });

  it('rejects requests without a Backstage user', async () => {
    const httpAuth = mockServices.httpAuth.mock({
      credentials: async () => {
        throw new AuthenticationError('nope');
      },
    });
    const res = await request(await buildApp([REPO], { httpAuth })).get(
      '/repos',
    );
    expect(res.status).toBe(401);
  });

  it('answers 401 without the muster token header', async () => {
    const res = await request(
      await buildApp([REPO], {}, { withToken: false }),
    ).get('/pulls');
    expect(res.status).toBe(401);
    expect(res.body.error.message).toContain(TOKEN_HEADER);
    expect(github.calls).toHaveLength(0);
  });

  describe('connection', () => {
    it('reports a connected session', async () => {
      const res = await request(app).get('/connection');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ connected: true });
    });

    it('reports the sign-in URL when the person has no grant yet', async () => {
      github.loginResult = {
        status: 'auth_required',
        authUrl: 'https://muster.example/oauth/proxy/start?state=x',
        message: 'Authentication required for github.',
      };
      const res = await request(app).get('/connection');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        connected: false,
        authUrl: 'https://muster.example/oauth/proxy/start?state=x',
        message: 'Authentication required for github.',
      });
    });
  });

  describe('a session without a grant', () => {
    it('reconnects silently and retries when the person consented before', async () => {
      github.failNextCallsWith = new Error(
        'tool not found: x_github_list_pull_requests',
      );
      github.answers.set('list_pull_requests', []);

      const res = await request(app).get('/pulls');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ pulls: [] });
      expect(github.logins).toBe(1);
      expect(
        github.calls.filter(c => c.tool === 'list_pull_requests'),
      ).toHaveLength(2);
    });

    it('answers 401 with the sign-in URL when a consent is needed', async () => {
      github.failNextCallsWith = new Error(
        'tool not found: x_github_list_pull_requests',
      );
      github.loginResult = {
        status: 'auth_required',
        authUrl: 'https://muster.example/oauth/proxy/start?state=x',
        message: 'Authentication required for github.',
      };

      const res = await request(app).get('/pulls');

      expect(res.status).toBe(401);
      expect(res.body.error).toEqual({
        name: 'MusterServerNotConnectedError',
        message: expect.stringContaining("Connect 'github'"),
        server: 'github',
        authUrl: 'https://muster.example/oauth/proxy/start?state=x',
      });
    });

    it('does not mistake other failures for a missing grant', async () => {
      github.failNextCallsWith = new Error('GitHub responded with 500');
      const res = await request(app).get('/pulls');
      expect(res.status).toBe(500);
      expect(github.logins).toBe(0);
    });
  });

  describe('/pulls', () => {
    it('lists open pull requests as the caller and maps the fields', async () => {
      github.answers.set('list_pull_requests', [
        {
          number: 44,
          title: 'Plan: klaus agent type',
          user: { login: 'teemow' },
          draft: true,
          head: { ref: 'plan/klaus-agent-type' },
          updated_at: '2026-09-04T12:00:00Z',
          body: 'Body',
        },
        { number: 45, title: 'No body', user: null, head: null },
      ]);

      const res = await request(app).get('/pulls');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        pulls: [
          {
            number: 44,
            title: 'Plan: klaus agent type',
            author: 'teemow',
            draft: true,
            branch: 'plan/klaus-agent-type',
            updatedAt: '2026-09-04T12:00:00Z',
            body: 'Body',
          },
          { number: 45, title: 'No body', draft: false, body: '' },
        ],
      });
      expect(github.calls[0]).toEqual({
        tool: 'list_pull_requests',
        args: {
          owner: 'giantswarm',
          repo: 'bumblebee-plans',
          state: 'open',
          perPage: 100,
        },
        authToken: 'dex-id-token',
      });
    });

    it('rejects an unknown repository', async () => {
      const res = await request(app)
        .get('/pulls')
        .query({ repo: 'other/repo' });
      expect(res.status).toBe(400);
    });

    it('requires the repo parameter when several repositories are configured', async () => {
      const multi = await buildApp([REPO, 'giantswarm/other-plans']);
      expect((await request(multi).get('/pulls')).status).toBe(400);
      github.answers.set('list_pull_requests', []);
      const res = await request(multi)
        .get('/pulls')
        .query({ repo: 'giantswarm/other-plans' });
      expect(res.status).toBe(200);
      expect(github.calls[0].args).toMatchObject({
        owner: 'giantswarm',
        repo: 'other-plans',
      });
    });
  });

  describe('/pulls/:number/files', () => {
    it('maps the changed files of a pull request', async () => {
      github.answers.set(
        'pull_request_read',
        (args: Record<string, unknown>) => {
          expect(args).toMatchObject({ method: 'get_files', pullNumber: 44 });
          return [
            {
              filename: 'plan/PRD.md',
              status: 'added',
              additions: 10,
              deletions: 0,
              patch: '@@ +1 @@\n+# PRD',
            },
            {
              filename: 'plan/old.md',
              status: 'renamed',
              previous_filename: 'plan/older.md',
            },
          ];
        },
      );

      const res = await request(app).get('/pulls/44/files');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        files: [
          {
            filename: 'plan/PRD.md',
            status: 'added',
            additions: 10,
            deletions: 0,
            patch: '@@ +1 @@\n+# PRD',
          },
          {
            filename: 'plan/old.md',
            status: 'renamed',
            additions: 0,
            deletions: 0,
            previousFilename: 'plan/older.md',
          },
        ],
      });
    });

    it('rejects a non-numeric pull number', async () => {
      expect((await request(app).get('/pulls/abc/files')).status).toBe(400);
    });
  });

  describe('/pulls/:number/comments', () => {
    it('lists discussion comments', async () => {
      github.answers.set('pull_request_read', [
        {
          id: 1,
          user: { login: 'alice' },
          body: 'Hi',
          created_at: 't1',
          html_url: 'u1',
        },
      ]);
      const res = await request(app).get('/pulls/44/comments');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        comments: [
          {
            id: 1,
            author: 'alice',
            body: 'Hi',
            createdAt: 't1',
            htmlUrl: 'u1',
          },
        ],
      });
      expect(github.calls[0].args).toMatchObject({
        method: 'get_comments',
        pullNumber: 44,
      });
    });

    it('creates a discussion comment as the caller', async () => {
      github.answers.set('add_issue_comment', {
        id: 9,
        user: { login: 'alice' },
        body: 'Looks good',
        created_at: 't9',
        html_url: 'u9',
      });

      const res = await request(app)
        .post('/pulls/44/comments')
        .send({ body: 'Looks good' });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        comment: {
          id: 9,
          author: 'alice',
          body: 'Looks good',
          createdAt: 't9',
          htmlUrl: 'u9',
        },
      });
      expect(github.calls[0]).toMatchObject({
        tool: 'add_issue_comment',
        args: {
          owner: 'giantswarm',
          repo: 'bumblebee-plans',
          issue_number: 44,
          body: 'Looks good',
        },
      });
    });

    it('rejects an empty comment body', async () => {
      expect(
        (await request(app).post('/pulls/44/comments').send({ body: '  ' }))
          .status,
      ).toBe(400);
      expect(github.calls).toHaveLength(0);
    });
  });

  describe('/pulls/:number/review-comments', () => {
    const threads = {
      review_threads: [
        {
          id: 'PRRT_1',
          comments: [
            {
              body: 'root',
              path: 'plan/PRD.md',
              line: 51,
              original_line: 51,
              author: 'alice',
              created_at: 't1',
              html_url:
                'https://github.com/giantswarm/bumblebee-plans/pull/44#discussion_r100',
            },
            {
              body: 'reply',
              path: 'plan/PRD.md',
              line: null,
              original_line: 51,
              author: 'bob',
              created_at: 't2',
              html_url:
                'https://github.com/giantswarm/bumblebee-plans/pull/44#discussion_r101',
            },
          ],
        },
      ],
      pageInfo: { hasNextPage: false },
    };

    it('flattens review threads into comments with ids from their anchors', async () => {
      github.answers.set('pull_request_read', threads);

      const res = await request(app).get('/pulls/44/review-comments');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        comments: [
          {
            id: 100,
            author: 'alice',
            body: 'root',
            createdAt: 't1',
            htmlUrl:
              'https://github.com/giantswarm/bumblebee-plans/pull/44#discussion_r100',
            path: 'plan/PRD.md',
            line: 51,
            side: 'RIGHT',
          },
          {
            id: 101,
            author: 'bob',
            body: 'reply',
            createdAt: 't2',
            htmlUrl:
              'https://github.com/giantswarm/bumblebee-plans/pull/44#discussion_r101',
            path: 'plan/PRD.md',
            line: 51,
            side: 'RIGHT',
            inReplyTo: 100,
          },
        ],
      });
    });

    it('follows the review-thread cursor', async () => {
      github.answers.set(
        'pull_request_read',
        (args: Record<string, unknown>) =>
          args.after === undefined
            ? { ...threads, pageInfo: { hasNextPage: true, endCursor: 'c1' } }
            : { review_threads: [], pageInfo: { hasNextPage: false } },
      );
      const res = await request(app).get('/pulls/44/review-comments');
      expect(res.status).toBe(200);
      expect(res.body.comments).toHaveLength(2);
      expect(github.calls.map(c => c.args.after)).toEqual([undefined, 'c1']);
    });

    it('creates an inline comment through a pending review and returns it', async () => {
      const posted: string[] = [];
      github.answers.set(
        'pull_request_review_write',
        (args: Record<string, unknown>) => {
          posted.push(`review:${args.method}:${args.event ?? ''}`);
          return 'ok';
        },
      );
      github.answers.set(
        'add_comment_to_pending_review',
        (args: Record<string, unknown>) => {
          posted.push(
            `comment:${args.path}:${args.line}:${args.side}:${args.subjectType}`,
          );
          return 'ok';
        },
      );
      github.answers.set('pull_request_read', {
        review_threads: [
          {
            id: 'PRRT_2',
            comments: [
              {
                body: 'Consider X',
                path: 'plan/PRD.md',
                line: 12,
                author: 'alice',
                created_at: 't3',
                html_url:
                  'https://github.com/giantswarm/bumblebee-plans/pull/44#discussion_r200',
              },
            ],
          },
        ],
      });

      const res = await request(app)
        .post('/pulls/44/review-comments')
        .send({ body: 'Consider X', path: 'plan/PRD.md', line: 12 });

      expect(res.status).toBe(201);
      expect(posted).toEqual([
        'review:create:',
        'comment:plan/PRD.md:12:RIGHT:LINE',
        'review:submit_pending:COMMENT',
      ]);
      expect(res.body.comment).toMatchObject({
        id: 200,
        body: 'Consider X',
        path: 'plan/PRD.md',
        line: 12,
      });
    });

    it('reuses a pending review that is already open', async () => {
      github.answers.set(
        'pull_request_review_write',
        (args: Record<string, unknown>) => {
          if (args.method === 'create') {
            throw new Error('user already has a pending review');
          }
          return 'ok';
        },
      );
      github.answers.set('add_comment_to_pending_review', 'ok');
      github.answers.set('pull_request_read', { review_threads: [] });

      const res = await request(app)
        .post('/pulls/44/review-comments')
        .send({ body: 'Consider Y', path: 'plan/PRD.md', line: 3 });

      expect(res.status).toBe(201);
      expect(res.body.comment).toMatchObject({
        body: 'Consider Y',
        path: 'plan/PRD.md',
        line: 3,
        side: 'RIGHT',
      });
    });

    it('replies to a thread by comment id', async () => {
      github.answers.set('add_reply_to_pull_request_comment', 'ok');
      github.answers.set('pull_request_read', { review_threads: [] });

      const res = await request(app)
        .post('/pulls/44/review-comments')
        .send({ body: 'Agreed', inReplyTo: 100 });

      expect(res.status).toBe(201);
      expect(github.calls[0]).toMatchObject({
        tool: 'add_reply_to_pull_request_comment',
        args: {
          owner: 'giantswarm',
          repo: 'bumblebee-plans',
          pullNumber: 44,
          commentId: 100,
          body: 'Agreed',
        },
      });
      expect(res.body.comment).toMatchObject({
        body: 'Agreed',
        inReplyTo: 100,
      });
    });

    it('validates path and line for a new thread', async () => {
      expect(
        (
          await request(app)
            .post('/pulls/44/review-comments')
            .send({ body: 'x', path: '', line: 1 })
        ).status,
      ).toBe(400);
      expect(
        (
          await request(app)
            .post('/pulls/44/review-comments')
            .send({ body: 'x', path: 'a.md', line: 0 })
        ).status,
      ).toBe(400);
      expect(
        (
          await request(app)
            .post('/pulls/44/review-comments')
            .send({ body: 'x', inReplyTo: -1 })
        ).status,
      ).toBe(400);
      expect(github.calls).toHaveLength(0);
    });
  });

  describe('/tree', () => {
    const listing: Record<string, unknown[]> = {
      '/': [
        { name: 'README.md', path: 'README.md', type: 'file', size: 10 },
        { name: 'plan-a', path: 'plan-a', type: 'dir' },
      ],
      'plan-a/': [
        { name: 'PRD.md', path: 'plan-a/PRD.md', type: 'file', size: 20 },
        { name: 'sub', path: 'plan-a/sub', type: 'dir' },
      ],
      'plan-a/sub/': [
        { name: 'note.md', path: 'plan-a/sub/note.md', type: 'file', size: 5 },
      ],
    };

    it('walks the directories of the default branch', async () => {
      github.answers.set(
        'get_file_contents',
        (args: Record<string, unknown>) => listing[args.path as string],
      );

      const res = await request(app).get('/tree');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        truncated: false,
        tree: [
          { path: 'README.md', type: 'blob', size: 10 },
          { path: 'plan-a', type: 'tree' },
          { path: 'plan-a/PRD.md', type: 'blob', size: 20 },
          { path: 'plan-a/sub', type: 'tree' },
          { path: 'plan-a/sub/note.md', type: 'blob', size: 5 },
        ],
      });
      expect(github.calls.every(c => c.args.ref === undefined)).toBe(true);
    });

    it('resolves a branch name to its git ref', async () => {
      github.answers.set(
        'get_file_contents',
        (args: Record<string, unknown>) => {
          expect(args.ref).toBe('refs/heads/plan/klaus-agent-type');
          return [];
        },
      );
      const res = await request(app)
        .get('/tree')
        .query({ ref: 'plan/klaus-agent-type' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ truncated: false, tree: [] });
    });
  });

  describe('/content', () => {
    it('returns the file content from the resource block', async () => {
      github.contentAnswers.set(
        'get_file_contents',
        fileContent('# PRD\n\nBody'),
      );

      const res = await request(app)
        .get('/content')
        .query({ path: 'plan-a/PRD.md', ref: 'main' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        path: 'plan-a/PRD.md',
        ref: 'main',
        content: '# PRD\n\nBody',
      });
      expect(github.calls[0].args).toEqual({
        owner: 'giantswarm',
        repo: 'bumblebee-plans',
        path: 'plan-a/PRD.md',
        ref: 'refs/heads/main',
      });
    });

    it('requires the path parameter', async () => {
      expect((await request(app).get('/content')).status).toBe(400);
    });

    it('rejects a directory', async () => {
      github.contentAnswers.set('get_file_contents', [
        { type: 'text', text: '[{"name":"x"}]' },
      ]);
      expect(
        (await request(app).get('/content').query({ path: 'plan-a/' })).status,
      ).toBe(400);
    });
  });

  describe('/epics', () => {
    it('collects epics of merged plans and open pull requests', async () => {
      github.answers.set(
        'get_file_contents',
        (args: Record<string, unknown>) =>
          args.path === '/'
            ? [{ name: 'plan-a', path: 'plan-a', type: 'dir' }]
            : [
                { name: 'PRD.md', path: 'plan-a/PRD.md', type: 'file' },
                { name: 'ADR.md', path: 'plan-a/ADR.md', type: 'file' },
              ],
      );
      github.contentAnswers.set(
        'get_file_contents:plan-a/PRD.md',
        fileContent(
          '**Epic:** [giantswarm/giantswarm#1](https://github.com/giantswarm/giantswarm/issues/1)',
        ),
      );
      github.answers.set('list_pull_requests', [
        { number: 7, title: 'Plan: seven' },
      ]);
      github.answers.set('pull_request_read', [
        {
          filename: 'plan-b/PRD.md',
          patch: '@@\n+**Epic:** giantswarm/giantswarm#2\n',
        },
      ]);

      const res = await request(app).get('/epics');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        merged: [
          {
            folder: 'plan-a',
            path: 'plan-a/PRD.md',
            epic: {
              owner: 'giantswarm',
              repo: 'giantswarm',
              number: 1,
              url: 'https://github.com/giantswarm/giantswarm/issues/1',
            },
          },
        ],
        pulls: [
          {
            number: 7,
            title: 'Plan: seven',
            epic: {
              owner: 'giantswarm',
              repo: 'giantswarm',
              number: 2,
              url: 'https://github.com/giantswarm/giantswarm/issues/2',
            },
          },
        ],
      });

      // Cached per repository.
      const calls = github.calls.length;
      await request(app).get('/epics');
      expect(github.calls).toHaveLength(calls);
    });
  });
});
