import { MiddlewareFactory } from '@backstage/backend-defaults/rootHttpRouter';
import { mockServices } from '@backstage/backend-test-utils';
import { AuthenticationError } from '@backstage/errors';
import { JsonObject } from '@backstage/types';
import {
  AuthLoginResult,
  McpContentItem,
  MusterServerGateway,
} from '@giantswarm/backstage-plugin-gs-node';
import express from 'express';
import request from 'supertest';
import { createRouter, RouterOptions } from './router';

const TOKEN_HEADER = 'backstage-muster-authorization';

type Call = { tool: string; args: Record<string, unknown>; authToken: string };

/** pro-through-muster stand-in: answers keyed by tool, every call recorded. */
class FakePro implements MusterServerGateway {
  readonly server = 'gazelle-mcp-pro';
  calls: Call[] = [];
  answers = new Map<
    string,
    unknown | ((args: Record<string, unknown>) => unknown)
  >();
  loginResult: AuthLoginResult = {
    status: 'connected',
    message: 'Already Connected',
  };
  failNextCallWith?: Error;
  logins = 0;

  async call(tool: string, args: Record<string, unknown>, authToken: string) {
    this.calls.push({ tool, args, authToken });
    if (this.failNextCallWith) {
      const error = this.failNextCallWith;
      this.failNextCallWith = undefined;
      throw error;
    }
    const answer = this.answers.get(tool);
    if (answer === undefined) {
      throw new Error(`FakePro: no answer for ${tool}`);
    }
    return typeof answer === 'function' ? answer(args) : answer;
  }

  async callContent(): Promise<McpContentItem[]> {
    throw new Error('not used');
  }

  async login() {
    this.logins++;
    return this.loginResult;
  }
}

const ITEM = {
  id: 'PVTI_1',
  title: 'Agent workspaces',
  number: 45,
  url: 'https://github.com/giantswarm/giantswarm/issues/45',
  repo: 'giantswarm/giantswarm',
  private: true,
  state: 'OPEN',
  fields: { Status: 'In Progress ⛏️', Team: 'Bumblebee🐝' },
};

describe('createRouter', () => {
  let pro: FakePro;

  async function buildApp(
    configData: JsonObject = {
      roadmap: { board: 'roadmap', teams: ['Bumblebee🐝'] },
    },
    options: Partial<RouterOptions> = {},
    {
      withToken = true,
      user = 'user:default/alice',
    }: { withToken?: boolean; user?: string } = {},
  ) {
    const logger = mockServices.logger.mock();
    const config = mockServices.rootConfig({ data: configData });
    const router = await createRouter({
      logger,
      config,
      httpAuth: mockServices.httpAuth(),
      pro,
      ...options,
    });
    const app = express();
    if (withToken) {
      app.use((req, _res, next) => {
        req.headers[TOKEN_HEADER] = `dex-id-token-${user}`;
        next();
      });
    }
    app.use(router);
    app.use(MiddlewareFactory.create({ logger, config }).error());
    return app;
  }

  let app: express.Express;

  beforeEach(async () => {
    pro = new FakePro();
    app = await buildApp();
  });

  it('rejects requests without a Backstage user', async () => {
    const httpAuth = mockServices.httpAuth.mock({
      credentials: async () => {
        throw new AuthenticationError('nope');
      },
    });
    const res = await request(await buildApp(undefined, { httpAuth })).get(
      '/schema',
    );
    expect(res.status).toBe(401);
  });

  it('returns 503 when no board is configured', async () => {
    const res = await request(await buildApp({})).get('/schema');
    expect(res.status).toBe(503);
  });

  it('returns 503 when muster is not configured', async () => {
    const res = await request(
      await buildApp(undefined, { pro: undefined }),
    ).get('/schema');
    expect(res.status).toBe(503);
    expect(res.body.error.message).toMatch(/roadmap\.muster/);
  });

  it('answers 401 without the muster token header', async () => {
    const res = await request(
      await buildApp(undefined, {}, { withToken: false }),
    ).get('/schema');
    expect(res.status).toBe(401);
    expect(res.body.error.message).toContain(TOKEN_HEADER);
    expect(pro.calls).toHaveLength(0);
  });

  describe('connection', () => {
    it('reports the sign-in URL when the person has no grant yet', async () => {
      pro.loginResult = {
        status: 'auth_required',
        authUrl: 'https://muster.example/oauth/proxy/start?state=x',
        message: 'Authentication required for gazelle-mcp-pro.',
      };
      const res = await request(app).get('/connection');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        connected: false,
        authUrl: 'https://muster.example/oauth/proxy/start?state=x',
        message: 'Authentication required for gazelle-mcp-pro.',
      });
    });
  });

  describe('a session without a grant', () => {
    it('reconnects silently and retries', async () => {
      pro.failNextCallWith = new Error(
        'tool not found: x_pro_get_board_schema',
      );
      pro.answers.set('get_board_schema', { board: 'roadmap', fields: [] });

      const res = await request(app).get('/schema');

      expect(res.status).toBe(200);
      expect(pro.logins).toBe(1);
      expect(pro.calls.filter(c => c.tool === 'get_board_schema')).toHaveLength(
        2,
      );
    });

    it('answers 401 with the sign-in URL when a consent is needed', async () => {
      pro.failNextCallWith = new Error('tool not found: x_pro_list_issues');
      pro.loginResult = {
        status: 'auth_required',
        authUrl: 'https://muster.example/oauth/proxy/start?state=x',
        message: 'Authentication required.',
      };

      const res = await request(app).get('/items');

      expect(res.status).toBe(401);
      expect(res.body.error).toEqual({
        name: 'MusterServerNotConnectedError',
        message: expect.stringContaining("Connect 'gazelle-mcp-pro'"),
        server: 'gazelle-mcp-pro',
        authUrl: 'https://muster.example/oauth/proxy/start?state=x',
      });
    });
  });

  describe('/schema', () => {
    it('describes the board through pro and exposes the default teams', async () => {
      pro.answers.set('get_board_schema', {
        board: 'roadmap',
        fields: [
          {
            name: 'Status',
            type: 'singleSelect',
            options: ['Inbox 📥', 'Done ✅'],
          },
          { name: 'Quarter', type: 'iteration', iterations: ['Q3 2026'] },
        ],
      });

      const res = await request(app).get('/schema');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        board: 'roadmap',
        defaultTeams: ['Bumblebee🐝'],
        fields: [
          {
            name: 'Status',
            type: 'singleSelect',
            options: ['Inbox 📥', 'Done ✅'],
          },
          { name: 'Quarter', type: 'iteration', iterations: ['Q3 2026'] },
        ],
      });
      expect(pro.calls[0]).toEqual({
        tool: 'get_board_schema',
        args: { board: 'roadmap' },
        authToken: 'dex-id-token-user:default/alice',
      });
    });

    it('caches the schema per person', async () => {
      pro.answers.set('get_board_schema', { fields: [] });
      await request(app).get('/schema');
      await request(app).get('/schema');
      expect(pro.calls).toHaveLength(1);
    });
  });

  describe('/items', () => {
    it('passes board filters to pro by field name, as the caller', async () => {
      pro.answers.set('list_issues', { count: 1, issues: [ITEM] });

      const res = await request(app).get('/items').query({
        team: 'Bumblebee🐝',
        status: 'In Progress ⛏️',
        assignee: 'teemow',
        state: 'open',
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ items: [ITEM] });
      expect(pro.calls[0]).toEqual({
        tool: 'list_issues',
        args: {
          board: 'roadmap',
          filters: { Team: 'Bumblebee🐝', Status: 'In Progress ⛏️' },
          assignee: 'teemow',
          state: 'open',
        },
        authToken: 'dex-id-token-user:default/alice',
      });
    });

    it('turns quarter and keyword into a combined keyword query', async () => {
      pro.answers.set('list_issues', { issues: [] });
      await request(app)
        .get('/items')
        .query({ quarter: 'Q3 2026', keyword: 'muster' });
      expect(pro.calls[0].args.keyword).toBe('quarter:"Q3 2026" muster');
    });

    it('caches identical queries within the TTL', async () => {
      pro.answers.set('list_issues', { issues: [] });
      await request(app).get('/items').query({ team: 'Bumblebee🐝' });
      await request(app).get('/items').query({ team: 'Bumblebee🐝' });
      expect(pro.calls).toHaveLength(1);
    });

    it('rejects repeated query parameters', async () => {
      const res = await request(app).get('/items?team=a&team=b');
      expect(res.status).toBe(400);
    });
  });

  describe('/overview', () => {
    it('aggregates status and repo distributions', async () => {
      pro.answers.set('list_issues', {
        issues: [
          ITEM,
          {
            ...ITEM,
            id: 'PVTI_2',
            repo: 'giantswarm/roadmap',
            fields: { Status: 'Done ✅' },
          },
          { ...ITEM, id: 'PVTI_3', repo: null, fields: {} },
        ],
      });

      const res = await request(app)
        .get('/overview')
        .query({ team: 'Bumblebee🐝' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        total: 3,
        byStatus: { 'In Progress ⛏️': 1, 'Done ✅': 1, 'No status': 1 },
        byRepo: {
          'giantswarm/giantswarm': 1,
          'giantswarm/roadmap': 1,
          unknown: 1,
        },
      });
      expect(pro.calls[0].args).toEqual({
        board: 'roadmap',
        filters: { Team: 'Bumblebee🐝' },
      });
    });
  });

  describe('/items/by-issue/:owner/:repo/:number', () => {
    it('resolves the issue through a targeted lookup', async () => {
      pro.answers.set('get_item_by_issue', { item: ITEM });

      const res = await request(app).get(
        '/items/by-issue/giantswarm/giantswarm/45',
      );

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ item: ITEM });
      expect(pro.calls[0].args).toEqual({
        board: 'roadmap',
        owner: 'giantswarm',
        repo: 'giantswarm',
        issue_number: 45,
      });
    });

    it('returns 404 for an issue that is not on the board', async () => {
      pro.answers.set('get_item_by_issue', { item: null });
      const res = await request(app).get(
        '/items/by-issue/giantswarm/giantswarm/1',
      );
      expect(res.status).toBe(404);
    });

    it('rejects a non-numeric issue number', async () => {
      expect((await request(app).get('/items/by-issue/a/b/x')).status).toBe(
        400,
      );
    });
  });

  describe('/items/:id', () => {
    it('returns the item detail from pro', async () => {
      const detail = { number: 45, title: 'Agent workspaces', fields: [] };
      pro.answers.set('get_issue_details', detail);

      const res = await request(app).get('/items/PVTI_1');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ item: detail });
      expect(pro.calls[0].args).toEqual({ itemId: 'PVTI_1' });
    });
  });

  describe('GET /issues/:owner/:repo/:number/sub-issues', () => {
    it('returns the mapped sub-issue tree and parent', async () => {
      pro.answers.set('list_sub_issues', {
        count: 1,
        sub_issues: [
          {
            id: 7,
            number: 46,
            title: 'Child',
            url: 'https://github.com/giantswarm/giantswarm/issues/46',
            state: 'open',
            repository: 'giantswarm/giantswarm',
            assignees: ['alice'],
          },
        ],
      });
      pro.answers.set('get_parent_issue', {
        parent: {
          id: 5,
          number: 44,
          title: 'Parent',
          url: 'https://github.com/giantswarm/giantswarm/issues/44',
          state: 'open',
        },
      });

      const res = await request(app).get(
        '/issues/giantswarm/giantswarm/45/sub-issues',
      );

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        subIssues: [
          {
            id: 7,
            number: 46,
            title: 'Child',
            state: 'open',
            htmlUrl: 'https://github.com/giantswarm/giantswarm/issues/46',
            assignees: ['alice'],
            repo: 'giantswarm/giantswarm',
          },
        ],
        parent: {
          id: 5,
          number: 44,
          title: 'Parent',
          state: 'open',
          htmlUrl: 'https://github.com/giantswarm/giantswarm/issues/44',
          assignees: [],
        },
      });
      expect(pro.calls.map(c => c.tool).sort()).toEqual([
        'get_parent_issue',
        'list_sub_issues',
      ]);
    });
  });

  describe('PATCH /items/:id/field', () => {
    it('updates the field through pro and patches the cached list', async () => {
      pro.answers.set('list_issues', { issues: [ITEM] });
      pro.answers.set('update_issue_field', {
        success: true,
        itemId: 'PVTI_1',
        field: 'Status',
        value: 'Done ✅',
      });

      await request(app).get('/items').query({ team: 'Bumblebee🐝' });
      const res = await request(app)
        .patch('/items/PVTI_1/field')
        .send({ name: 'status', value: 'done' });

      expect(res.status).toBe(200);
      expect(
        pro.calls.find(c => c.tool === 'update_issue_field')?.args,
      ).toEqual({
        board: 'roadmap',
        itemId: 'PVTI_1',
        fieldName: 'status',
        value: 'done',
      });
      const list = await request(app)
        .get('/items')
        .query({ team: 'Bumblebee🐝' });
      expect(list.body.items[0].fields.Status).toBe('Done ✅');
      expect(pro.calls.filter(c => c.tool === 'list_issues')).toHaveLength(1);
    });

    it("maps pro's refusal of an unknown value to 400", async () => {
      pro.answers.set('update_issue_field', () => {
        throw new Error(
          "Option 'nope' not found for field 'Status'. Available options: Inbox 📥, Done ✅",
        );
      });
      const res = await request(app)
        .patch('/items/PVTI_1/field')
        .send({ name: 'Status', value: 'nope' });
      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/Available options/);
    });

    it('maps a GitHub permission failure to 403', async () => {
      pro.answers.set('update_issue_field', () => {
        throw new Error('GitHub error: Resource not accessible by integration');
      });
      const res = await request(app)
        .patch('/items/PVTI_1/field')
        .send({ name: 'Status', value: 'Done ✅' });
      expect(res.status).toBe(403);
    });

    it('validates the body', async () => {
      expect(
        (
          await request(app)
            .patch('/items/PVTI_1/field')
            .send({ name: '', value: 'x' })
        ).status,
      ).toBe(400);
      expect(
        (
          await request(app)
            .patch('/items/PVTI_1/field')
            .send({ name: 'Status' })
        ).status,
      ).toBe(400);
    });
  });

  describe('sub-issue writes', () => {
    it('links a child by reference as the caller', async () => {
      pro.answers.set('add_sub_issue', {
        success: true,
        parent: { id: 5, number: 45, title: 'Parent', url: 'u', state: 'open' },
      });

      const res = await request(app)
        .post('/issues/giantswarm/giantswarm/45/sub-issues')
        .send({ child: 'giantswarm/giantswarm#46' });

      expect(res.status).toBe(201);
      expect(res.body.parent).toMatchObject({
        id: 5,
        number: 45,
        htmlUrl: 'u',
      });
      expect(pro.calls[0]).toMatchObject({
        tool: 'add_sub_issue',
        args: {
          owner: 'giantswarm',
          repo: 'giantswarm',
          issue_number: 45,
          subIssueUrl: 'giantswarm/giantswarm#46',
        },
      });
    });

    it('rejects a missing child reference', async () => {
      const res = await request(app)
        .post('/issues/giantswarm/giantswarm/45/sub-issues')
        .send({});
      expect(res.status).toBe(400);
      expect(pro.calls).toHaveLength(0);
    });

    it('unlinks a sub-issue by id', async () => {
      pro.answers.set('remove_sub_issue', { success: true, removed: 7 });
      const res = await request(app).delete(
        '/issues/giantswarm/giantswarm/45/sub-issues/7',
      );
      expect(res.status).toBe(204);
      expect(pro.calls[0].args).toEqual({
        owner: 'giantswarm',
        repo: 'giantswarm',
        issue_number: 45,
        subIssueId: 7,
      });
    });
  });
});
