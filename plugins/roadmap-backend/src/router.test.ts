import { MiddlewareFactory } from '@backstage/backend-defaults/rootHttpRouter';
import { mockServices } from '@backstage/backend-test-utils';
import { JsonObject } from '@backstage/types';
import { AuthenticationError } from '@backstage/errors';
import { GithubCredentialsProvider } from '@backstage/integration';
import express from 'express';
import request from 'supertest';
import { createRouter, RouterOptions } from './router';

const BOARD_ID = 'PVT_board';
const APP_TOKEN = 'app-token';
const USER_TOKEN = 'user-token';

const STATUS_FIELD = {
  __typename: 'ProjectV2SingleSelectField',
  id: 'F_status',
  name: 'Status',
  dataType: 'SINGLE_SELECT',
  options: [
    { id: 'O_inprogress', name: 'In Progress ⛏️' },
    { id: 'O_done', name: 'Done ✅' },
  ],
};

const QUARTER_FIELD = {
  __typename: 'ProjectV2IterationField',
  id: 'F_quarter',
  name: 'Quarter',
  dataType: 'ITERATION',
  configuration: {
    iterations: [{ id: 'I_q3', title: 'Q3 2026', startDate: '2026-07-01' }],
  },
};

const DATE_FIELD = {
  __typename: 'ProjectV2Field',
  id: 'F_target',
  name: 'Target Date',
  dataType: 'DATE',
};

const ITEM = {
  id: 'PVTI_1',
  title: 'Ship the roadmap plugin',
  number: 42,
  url: 'https://github.com/giantswarm/giantswarm/issues/42',
  repo: 'giantswarm/giantswarm',
  private: true,
  fields: { Status: 'In Progress ⛏️', Team: 'Bumblebee🐝' },
};

const REST_ISSUE = {
  id: 1001,
  number: 43,
  title: 'A sub-issue',
  state: 'open',
  html_url: 'https://github.com/giantswarm/giantswarm/issues/43',
  assignees: [{ login: 'teemow' }],
  repository_url: 'https://api.github.com/repos/giantswarm/giantswarm',
};

function buildProMock() {
  return {
    resolveBoardId: jest.fn().mockReturnValue(BOARD_ID),
    listItems: jest.fn().mockResolvedValue({ status: 'success', data: [ITEM] }),
    getItemByID: jest.fn().mockResolvedValue({ title: ITEM.title }),
    listFields: jest
      .fn()
      .mockResolvedValue([STATUS_FIELD, QUARTER_FIELD, DATE_FIELD]),
    findFieldByName: jest.fn().mockResolvedValue(STATUS_FIELD),
    findMatchingOption: jest.fn(
      (options: Array<{ id: string; name: string }>, name: string) =>
        options.find(option => option.name === name) ?? null,
    ),
    findMatchingIteration: jest.fn(
      (field: typeof QUARTER_FIELD, value: string) =>
        field.configuration.iterations.find(
          iteration => iteration.title === value,
        ) ?? null,
    ),
    updateItemField: jest.fn().mockResolvedValue({}),
    graphQLWithAuth: jest.fn().mockResolvedValue({
      repository: {
        issue: {
          title: ITEM.title,
          url: ITEM.url,
          state: 'OPEN',
          projectItems: {
            nodes: [
              {
                id: ITEM.id,
                project: { id: BOARD_ID },
                fieldValues: {
                  nodes: [
                    { name: 'In Progress ⛏️', field: { name: 'Status' } },
                    { title: 'Q3 2026', field: { name: 'Quarter' } },
                  ],
                },
              },
              { id: 'PVTI_other', project: { id: 'PVT_other' } },
            ],
          },
        },
      },
    }),
    listSubIssues: jest.fn().mockResolvedValue([REST_ISSUE]),
    getParentIssue: jest.fn().mockResolvedValue(null),
    addSubIssue: jest.fn().mockResolvedValue(REST_ISSUE),
    removeSubIssue: jest.fn().mockResolvedValue(undefined),
    resolveIssueId: jest.fn().mockResolvedValue({ id: 2002, number: 44 }),
  };
}

type ProMock = ReturnType<typeof buildProMock>;

describe('createRouter', () => {
  const getCredentials = jest.fn();
  const credentialsProvider = {
    getCredentials,
  } as unknown as GithubCredentialsProvider;

  let pro: ProMock;
  let app: express.Express;

  // Mirror the production setup: the backend's root HTTP router applies
  // MiddlewareFactory.error() after plugin routes, mapping @backstage/errors
  // classes to status codes.
  async function buildApp(
    configData: JsonObject = { roadmap: { board: 'roadmap' } },
    options: Partial<RouterOptions> = {},
  ) {
    const logger = mockServices.logger.mock();
    const config = mockServices.rootConfig({ data: configData });
    const router = await createRouter({
      logger,
      config,
      httpAuth: mockServices.httpAuth(),
      credentialsProvider,
      pro: pro as unknown as RouterOptions['pro'],
      // Warming fires an untracked background listItems call that would
      // race the per-test call-count assertions; covered by its own test.
      warmCache: false,
      ...options,
    });
    const builtApp = express();
    builtApp.use(router);
    builtApp.use(MiddlewareFactory.create({ logger, config }).error());
    return builtApp;
  }

  beforeEach(async () => {
    getCredentials.mockReset();
    getCredentials.mockResolvedValue({ token: APP_TOKEN });
    pro = buildProMock();
    app = await buildApp();
  });

  it('rejects requests without a Backstage user', async () => {
    const credentials = jest
      .fn()
      .mockRejectedValue(new AuthenticationError('missing credentials'));
    const unauthedApp = await buildApp(undefined, {
      httpAuth: { credentials } as unknown as RouterOptions['httpAuth'],
    });

    const response = await request(unauthedApp).get('/items');

    expect(response.status).toBe(401);
    expect(credentials).toHaveBeenCalledWith(expect.anything(), {
      allow: ['user'],
    });
  });

  it('returns 503 when no board is configured', async () => {
    const unconfiguredApp = await buildApp({});

    const response = await request(unconfiguredApp).get('/items');

    expect(response.status).toBe(503);
    expect(response.body.error.name).toBe('ServiceUnavailableError');
    expect(pro.listItems).not.toHaveBeenCalled();
  });

  describe('/schema', () => {
    it('maps board fields and exposes configured default teams', async () => {
      const configuredApp = await buildApp({
        roadmap: { board: 'roadmap', teams: ['Bumblebee🐝'] },
      });

      const response = await request(configuredApp).get('/schema');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        board: 'roadmap',
        defaultTeams: ['Bumblebee🐝'],
        fields: [
          {
            name: 'Status',
            type: 'singleSelect',
            options: ['In Progress ⛏️', 'Done ✅'],
          },
          { name: 'Quarter', type: 'iteration', iterations: ['Q3 2026'] },
          { name: 'Target Date', type: 'date' },
        ],
      });
      expect(pro.listFields).toHaveBeenCalledWith(BOARD_ID, APP_TOKEN);
    });

    it('caches the schema between requests', async () => {
      await request(app).get('/schema');
      await request(app).get('/schema');

      expect(pro.listFields).toHaveBeenCalledTimes(1);
    });
  });

  describe('/items', () => {
    it('passes filters through to pro with the App token', async () => {
      const response = await request(app).get(
        '/items?team=Bumblebee🐝&status=In Progress&kind=Epic&assignee=teemow&state=open&updated=>@today-7d&repository=giantswarm/giantswarm',
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ items: [ITEM] });
      expect(pro.listItems).toHaveBeenCalledWith({
        boardId: BOARD_ID,
        filters: {
          team: 'Bumblebee🐝',
          status: 'In Progress',
          kind: 'Epic',
        },
        assignee: 'teemow',
        state: 'open',
        updated: '>@today-7d',
        repository: 'giantswarm/giantswarm',
        keyword: null,
        token: APP_TOKEN,
      });
    });

    it('turns quarter and keyword into a combined keyword query', async () => {
      await request(app).get('/items?quarter=Q3 2026&keyword=gateway');

      expect(pro.listItems).toHaveBeenCalledWith(
        expect.objectContaining({ keyword: 'quarter:"Q3 2026" gateway' }),
      );
    });

    it('caches identical queries within the TTL', async () => {
      await request(app).get('/items?team=Bumblebee🐝');
      await request(app).get('/items?team=Bumblebee🐝');
      await request(app).get('/items?team=Rocket 🚀');

      expect(pro.listItems).toHaveBeenCalledTimes(2);
    });

    it('maps pro filter errors to 400', async () => {
      pro.listItems.mockResolvedValue({
        status: 'error',
        error: "Field 'bogus' not found",
      });

      const response = await request(app).get('/items?team=bogus');

      expect(response.status).toBe(400);
      expect(response.body.error.message).toMatch("Field 'bogus' not found");
    });

    it('rejects repeated query parameters', async () => {
      const response = await request(app).get('/items?team=a&team=b');

      expect(response.status).toBe(400);
    });
  });

  describe('/overview', () => {
    it('aggregates status and repo distributions', async () => {
      pro.listItems.mockResolvedValue({
        status: 'success',
        data: [
          ITEM,
          { ...ITEM, id: 'PVTI_2', fields: { Status: 'Done ✅' } },
          { ...ITEM, id: 'PVTI_3', repo: null, fields: {} },
        ],
      });

      const response = await request(app).get('/overview');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        total: 3,
        byStatus: { 'In Progress ⛏️': 1, 'Done ✅': 1, 'No status': 1 },
        byRepo: { 'giantswarm/giantswarm': 2, unknown: 1 },
      });
    });
  });

  describe('/items/:id', () => {
    it('returns the item detail', async () => {
      const response = await request(app).get('/items/PVTI_1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ item: { title: ITEM.title } });
      expect(pro.getItemByID).toHaveBeenCalledWith('PVTI_1', APP_TOKEN);
    });
  });

  it('warms the default team view on startup', async () => {
    await buildApp(
      { roadmap: { board: 'roadmap', teams: ['Bumblebee🐝'] } },
      { warmCache: true },
    );
    // Let the fire-and-forget warm call settle.
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(pro.listItems).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: { team: 'Bumblebee🐝' },
        token: APP_TOKEN,
      }),
    );
  });

  describe('/items/by-issue/:owner/:repo/:number', () => {
    it('resolves an issue reference via a targeted query, not a board scan', async () => {
      const response = await request(app).get(
        '/items/by-issue/giantswarm/giantswarm/42',
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        item: {
          id: ITEM.id,
          title: ITEM.title,
          number: 42,
          url: ITEM.url,
          repo: 'giantswarm/giantswarm',
          state: 'OPEN',
          fields: { Status: 'In Progress ⛏️', Quarter: 'Q3 2026' },
        },
      });
      expect(pro.graphQLWithAuth).toHaveBeenCalledWith(
        expect.stringContaining('projectItems'),
        { owner: 'giantswarm', repo: 'giantswarm', number: 42 },
        APP_TOKEN,
      );
      expect(pro.listItems).not.toHaveBeenCalled();
    });

    it('returns 404 for an issue that is not on the board', async () => {
      pro.graphQLWithAuth.mockResolvedValue({
        repository: {
          issue: {
            title: 'Off-board issue',
            url: 'https://github.com/giantswarm/giantswarm/issues/999',
            state: 'OPEN',
            projectItems: {
              nodes: [{ id: 'PVTI_other', project: { id: 'PVT_other' } }],
            },
          },
        },
      });

      const response = await request(app).get(
        '/items/by-issue/giantswarm/giantswarm/999',
      );

      expect(response.status).toBe(404);
      expect(response.body.error.name).toBe('NotFoundError');
    });

    it('rejects a non-numeric issue number', async () => {
      const response = await request(app).get(
        '/items/by-issue/giantswarm/giantswarm/abc',
      );

      expect(response.status).toBe(400);
      expect(pro.graphQLWithAuth).not.toHaveBeenCalled();
    });
  });

  describe('GET /issues/:owner/:repo/:number/sub-issues', () => {
    it('returns the mapped sub-issue tree and parent', async () => {
      pro.getParentIssue.mockResolvedValue({
        ...REST_ISSUE,
        id: 999,
        number: 40,
        title: 'The epic',
      });

      const response = await request(app).get(
        '/issues/giantswarm/giantswarm/42/sub-issues',
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        subIssues: [
          {
            id: 1001,
            number: 43,
            title: 'A sub-issue',
            state: 'open',
            htmlUrl: 'https://github.com/giantswarm/giantswarm/issues/43',
            assignees: ['teemow'],
            repo: 'giantswarm/giantswarm',
          },
        ],
        parent: expect.objectContaining({ id: 999, title: 'The epic' }),
      });
      expect(pro.listSubIssues).toHaveBeenCalledWith(
        {
          owner: 'giantswarm',
          repo: 'giantswarm',
          issue_number: 42,
          per_page: 100,
        },
        APP_TOKEN,
      );
    });

    it('rejects a non-numeric issue number', async () => {
      const response = await request(app).get(
        '/issues/giantswarm/giantswarm/abc/sub-issues',
      );

      expect(response.status).toBe(400);
    });
  });

  describe('PATCH /items/:id/field', () => {
    it('requires the per-user GitHub token', async () => {
      const response = await request(app)
        .patch('/items/PVTI_1/field')
        .send({ name: 'Status', value: 'Done ✅' });

      expect(response.status).toBe(401);
      expect(pro.updateItemField).not.toHaveBeenCalled();
    });

    it('resolves a single-select option and mutates with the user token', async () => {
      const response = await request(app)
        .patch('/items/PVTI_1/field')
        .set('X-GitHub-Token', USER_TOKEN)
        .send({ name: 'Status', value: 'Done ✅' });

      expect(response.status).toBe(200);
      expect(pro.findFieldByName).toHaveBeenCalledWith(
        'Status',
        BOARD_ID,
        USER_TOKEN,
      );
      expect(pro.updateItemField).toHaveBeenCalledWith(
        'PVTI_1',
        'F_status',
        { singleSelectOptionId: 'O_done' },
        BOARD_ID,
        USER_TOKEN,
      );
    });

    it('resolves an iteration field value', async () => {
      pro.findFieldByName.mockResolvedValue(QUARTER_FIELD);

      const response = await request(app)
        .patch('/items/PVTI_1/field')
        .set('X-GitHub-Token', USER_TOKEN)
        .send({ name: 'Quarter', value: 'Q3 2026' });

      expect(response.status).toBe(200);
      expect(pro.updateItemField).toHaveBeenCalledWith(
        'PVTI_1',
        'F_quarter',
        { iterationId: 'I_q3' },
        BOARD_ID,
        USER_TOKEN,
      );
    });

    it('validates date fields', async () => {
      pro.findFieldByName.mockResolvedValue(DATE_FIELD);

      const invalid = await request(app)
        .patch('/items/PVTI_1/field')
        .set('X-GitHub-Token', USER_TOKEN)
        .send({ name: 'Target Date', value: 'next week' });
      expect(invalid.status).toBe(400);

      const valid = await request(app)
        .patch('/items/PVTI_1/field')
        .set('X-GitHub-Token', USER_TOKEN)
        .send({ name: 'Target Date', value: '2026-09-30' });
      expect(valid.status).toBe(200);
      expect(pro.updateItemField).toHaveBeenCalledWith(
        'PVTI_1',
        'F_target',
        { date: '2026-09-30' },
        BOARD_ID,
        USER_TOKEN,
      );
    });

    it('rejects unknown option values with the available options', async () => {
      const response = await request(app)
        .patch('/items/PVTI_1/field')
        .set('X-GitHub-Token', USER_TOKEN)
        .send({ name: 'Status', value: 'Nope' });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toMatch('In Progress ⛏️');
      expect(pro.updateItemField).not.toHaveBeenCalled();
    });

    it('maps GitHub permission failures to 403', async () => {
      pro.updateItemField.mockRejectedValue(
        Object.assign(new Error('Resource not accessible'), { status: 403 }),
      );

      const response = await request(app)
        .patch('/items/PVTI_1/field')
        .set('X-GitHub-Token', USER_TOKEN)
        .send({ name: 'Status', value: 'Done ✅' });

      expect(response.status).toBe(403);
    });

    it('patches cached lists in place after a write instead of rescanning', async () => {
      await request(app).get('/items');
      await request(app)
        .patch('/items/PVTI_1/field')
        .set('X-GitHub-Token', USER_TOKEN)
        .send({ name: 'Status', value: 'Done ✅' });
      const response = await request(app).get('/items');

      // No second board scan -- the cached list already carries the update.
      expect(pro.listItems).toHaveBeenCalledTimes(1);
      expect(response.body.items[0].fields.Status).toBe('Done ✅');
    });

    it('drops the cached item detail after a write', async () => {
      await request(app).get('/items/PVTI_1');
      await request(app)
        .patch('/items/PVTI_1/field')
        .set('X-GitHub-Token', USER_TOKEN)
        .send({ name: 'Status', value: 'Done ✅' });
      await request(app).get('/items/PVTI_1');

      expect(pro.getItemByID).toHaveBeenCalledTimes(2);
    });
  });

  describe('POST /issues/:owner/:repo/:number/sub-issues', () => {
    it('requires the per-user GitHub token', async () => {
      const response = await request(app)
        .post('/issues/giantswarm/giantswarm/42/sub-issues')
        .send({ child: 'giantswarm/giantswarm#44' });

      expect(response.status).toBe(401);
      expect(pro.addSubIssue).not.toHaveBeenCalled();
    });

    it('resolves the child reference and links it', async () => {
      const response = await request(app)
        .post('/issues/giantswarm/giantswarm/42/sub-issues')
        .set('X-GitHub-Token', USER_TOKEN)
        .send({ child: 'giantswarm/giantswarm#44' });

      expect(response.status).toBe(201);
      expect(pro.resolveIssueId).toHaveBeenCalledWith(
        'giantswarm/giantswarm#44',
        { token: USER_TOKEN },
      );
      expect(pro.addSubIssue).toHaveBeenCalledWith(
        {
          owner: 'giantswarm',
          repo: 'giantswarm',
          issue_number: 42,
          subIssueId: 2002,
        },
        USER_TOKEN,
      );
      expect(response.body.parent).toEqual(
        expect.objectContaining({ number: 43 }),
      );
    });

    it('rejects a missing child reference', async () => {
      const response = await request(app)
        .post('/issues/giantswarm/giantswarm/42/sub-issues')
        .set('X-GitHub-Token', USER_TOKEN)
        .send({});

      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /issues/:owner/:repo/:number/sub-issues/:subIssueId', () => {
    it('unlinks the sub-issue with the user token', async () => {
      const response = await request(app)
        .delete('/issues/giantswarm/giantswarm/42/sub-issues/1001')
        .set('X-GitHub-Token', USER_TOKEN);

      expect(response.status).toBe(204);
      expect(pro.removeSubIssue).toHaveBeenCalledWith(
        {
          owner: 'giantswarm',
          repo: 'giantswarm',
          issue_number: 42,
          subIssueId: 1001,
        },
        USER_TOKEN,
      );
    });

    it('requires the per-user GitHub token', async () => {
      const response = await request(app).delete(
        '/issues/giantswarm/giantswarm/42/sub-issues/1001',
      );

      expect(response.status).toBe(401);
      expect(pro.removeSubIssue).not.toHaveBeenCalled();
    });
  });
});
