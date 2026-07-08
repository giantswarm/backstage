import { MiddlewareFactory } from '@backstage/backend-defaults/rootHttpRouter';
import { mockServices } from '@backstage/backend-test-utils';
import { AuthenticationError } from '@backstage/errors';
import { GithubCredentialsProvider } from '@backstage/integration';
import express from 'express';
import request from 'supertest';
import { ProApi } from './proApi';
import { createRouter, RouterOptions } from './router';

const BOARD_ID = 'PVT_test_board';

const STATUS_FIELD = {
  __typename: 'ProjectV2SingleSelectField',
  id: 'field-status',
  name: 'Status',
  options: [
    { id: 'opt-inprogress', name: 'In Progress ⛏️' },
    { id: 'opt-done', name: 'Done ✅' },
  ],
};

const QUARTER_FIELD = {
  __typename: 'ProjectV2IterationField',
  id: 'field-quarter',
  name: 'Quarter',
  configuration: {
    iterations: [{ id: 'iter-q3', title: 'Q3 2026' }],
  },
};

function mockPro(): jest.Mocked<ProApi> {
  return {
    resolveBoardId: jest.fn().mockReturnValue(BOARD_ID),
    listItems: jest.fn(),
    getItemByID: jest.fn(),
    updateItemField: jest.fn(),
    listFields: jest.fn(),
    findFieldByName: jest.fn(),
    findMatchingOption: jest.fn((options, name) => {
      return options.find(option => option.name === name) ?? null;
    }),
    findMatchingIteration: jest.fn((field, value) => {
      return (
        field.configuration?.iterations?.find(
          iteration => iteration.title === value,
        ) ?? null
      );
    }),
    listSubIssues: jest.fn(),
    addSubIssue: jest.fn(),
    removeSubIssue: jest.fn(),
    getParentIssue: jest.fn(),
    parseIssueRef: jest.fn(),
    resolveIssueId: jest.fn(),
    graphQLWithAuth: jest.fn(),
  };
}

describe('createRouter', () => {
  const getCredentials = jest.fn();
  const credentialsProvider = {
    getCredentials,
  } as unknown as GithubCredentialsProvider;
  let pro: jest.Mocked<ProApi>;

  async function buildApp(options: Partial<RouterOptions> = {}) {
    const logger = mockServices.logger.mock();
    const config = mockServices.rootConfig({ data: {} });
    const router = await createRouter({
      logger,
      config,
      httpAuth: mockServices.httpAuth(),
      credentialsProvider,
      pro,
      ...options,
    });
    const app = express();
    app.use(router);
    app.use(MiddlewareFactory.create({ logger, config }).error());
    return app;
  }

  let app: express.Express;

  beforeEach(async () => {
    getCredentials.mockReset();
    getCredentials.mockResolvedValue({ token: 'app-token' });
    pro = mockPro();
    app = await buildApp();
  });

  it('rejects requests without a Backstage user', async () => {
    const credentials = jest
      .fn()
      .mockRejectedValue(new AuthenticationError('missing credentials'));
    const unauthedApp = await buildApp({
      httpAuth: { credentials } as unknown as RouterOptions['httpAuth'],
    });

    const response = await request(unauthedApp).get('/schema');

    expect(response.status).toBe(401);
    expect(credentials).toHaveBeenCalledWith(expect.anything(), {
      allow: ['user'],
    });
  });

  describe('/schema', () => {
    it('maps board fields and caches them', async () => {
      pro.listFields.mockResolvedValue([STATUS_FIELD, QUARTER_FIELD]);

      const response = await request(app).get('/schema');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        board: 'roadmap',
        fields: [
          {
            name: 'Status',
            type: 'singleSelect',
            options: ['In Progress ⛏️', 'Done ✅'],
          },
          { name: 'Quarter', type: 'iteration', iterations: ['Q3 2026'] },
        ],
      });
      expect(pro.listFields).toHaveBeenCalledWith(BOARD_ID, 'app-token');

      await request(app).get('/schema');
      expect(pro.listFields).toHaveBeenCalledTimes(1);
    });
  });

  describe('/items', () => {
    it('passes filters through and returns items', async () => {
      pro.listItems.mockResolvedValue({
        status: 'success',
        data: [
          {
            id: 'item-1',
            title: 'Epic',
            number: 1,
            url: 'https://github.com/giantswarm/giantswarm/issues/1',
            repo: 'giantswarm/giantswarm',
            private: true,
            fields: { Status: 'In Progress ⛏️' },
          },
        ],
      });

      const response = await request(app).get(
        '/items?team=Team Bumblebee🐝&status=In Progress ⛏️&quarter=Q3 2026&assignee=teemow',
      );

      expect(response.status).toBe(200);
      expect(response.body.items).toHaveLength(1);
      expect(pro.listItems).toHaveBeenCalledWith(
        expect.objectContaining({
          boardId: BOARD_ID,
          filters: { team: 'Team Bumblebee🐝', status: 'In Progress ⛏️' },
          assignee: 'teemow',
          keyword: 'quarter:"Q3 2026"',
          token: 'app-token',
        }),
      );
    });

    it('maps a pro error result to a client error', async () => {
      pro.listItems.mockResolvedValue({
        status: 'error',
        error: "Field 'bogus' not found",
      });

      const response = await request(app).get('/items?team=bogus');

      expect(response.status).toBe(400);
    });
  });

  describe('/items/:id', () => {
    it('returns item detail', async () => {
      const detail = {
        number: 42,
        title: 'Epic',
        url: 'https://github.com/giantswarm/giantswarm/issues/42',
        repository: null,
        body: 'body',
        author: 'teemow',
        assignees: [],
        comments: [],
        labels: [],
        projects: [],
        fields: [{ name: 'Status', value: 'In Progress ⛏️' }],
        createdAt: null,
        updatedAt: null,
        closedAt: null,
      };
      pro.getItemByID.mockResolvedValue(detail);

      const response = await request(app).get('/items/item-42');

      expect(response.status).toBe(200);
      expect(response.body.item).toEqual(detail);
      expect(pro.getItemByID).toHaveBeenCalledWith('item-42', 'app-token');
    });
  });

  describe('/resolve-item', () => {
    it('resolves an issue to its board item', async () => {
      pro.parseIssueRef.mockReturnValue({
        owner: 'giantswarm',
        repo: 'giantswarm',
        issue_number: 42,
      });
      pro.graphQLWithAuth.mockResolvedValue({
        repository: {
          issue: {
            projectItems: {
              nodes: [
                { id: 'item-other', project: { id: 'PVT_other' } },
                { id: 'item-42', project: { id: BOARD_ID } },
              ],
            },
          },
        },
      });

      const response = await request(app).get(
        '/resolve-item?issue=giantswarm/giantswarm%2342',
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ itemId: 'item-42' });
    });

    it('404s when the issue is not on the board', async () => {
      pro.parseIssueRef.mockReturnValue({
        owner: 'giantswarm',
        repo: 'giantswarm',
        issue_number: 43,
      });
      pro.graphQLWithAuth.mockResolvedValue({
        repository: { issue: { projectItems: { nodes: [] } } },
      });

      const response = await request(app).get(
        '/resolve-item?issue=giantswarm/giantswarm%2343',
      );

      expect(response.status).toBe(404);
    });
  });

  describe('/issues/:owner/:repo/:number/sub-issues', () => {
    it('returns sub-issues and parent', async () => {
      pro.listSubIssues.mockResolvedValue([
        {
          id: 100,
          number: 10,
          title: 'Child',
          state: 'open',
          html_url: 'https://github.com/giantswarm/giantswarm/issues/10',
          assignees: [{ login: 'teemow' }],
          repository_url: 'https://api.github.com/repos/giantswarm/giantswarm',
        },
      ]);
      pro.getParentIssue.mockResolvedValue(null);

      const response = await request(app).get(
        '/issues/giantswarm/giantswarm/42/sub-issues',
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        parent: null,
        subIssues: [
          {
            id: 100,
            number: 10,
            title: 'Child',
            state: 'open',
            htmlUrl: 'https://github.com/giantswarm/giantswarm/issues/10',
            assignees: ['teemow'],
            repo: 'giantswarm/giantswarm',
          },
        ],
      });
    });
  });

  describe('PATCH /items/:id/field', () => {
    it('rejects writes without a user token', async () => {
      const response = await request(app)
        .patch('/items/item-1/field')
        .send({ name: 'Status', value: 'Done ✅' });

      expect(response.status).toBe(401);
      expect(pro.updateItemField).not.toHaveBeenCalled();
    });

    it('updates a single-select field with the user token', async () => {
      pro.findFieldByName.mockResolvedValue(STATUS_FIELD);
      pro.updateItemField.mockResolvedValue({});

      const response = await request(app)
        .patch('/items/item-1/field')
        .set('X-GitHub-Token', 'user-token')
        .send({ name: 'Status', value: 'Done ✅' });

      expect(response.status).toBe(200);
      expect(pro.findFieldByName).toHaveBeenCalledWith(
        'Status',
        BOARD_ID,
        'user-token',
      );
      expect(pro.updateItemField).toHaveBeenCalledWith(
        'item-1',
        'field-status',
        { singleSelectOptionId: 'opt-done' },
        BOARD_ID,
        'user-token',
      );
    });

    it('updates an iteration field', async () => {
      pro.findFieldByName.mockResolvedValue(QUARTER_FIELD);
      pro.updateItemField.mockResolvedValue({});

      const response = await request(app)
        .patch('/items/item-1/field')
        .set('X-GitHub-Token', 'user-token')
        .send({ name: 'Quarter', value: 'Q3 2026' });

      expect(response.status).toBe(200);
      expect(pro.updateItemField).toHaveBeenCalledWith(
        'item-1',
        'field-quarter',
        { iterationId: 'iter-q3' },
        BOARD_ID,
        'user-token',
      );
    });

    it('rejects an unknown option value', async () => {
      pro.findFieldByName.mockResolvedValue(STATUS_FIELD);

      const response = await request(app)
        .patch('/items/item-1/field')
        .set('X-GitHub-Token', 'user-token')
        .send({ name: 'Status', value: 'Nonsense' });

      expect(response.status).toBe(400);
      expect(pro.updateItemField).not.toHaveBeenCalled();
    });

    it('invalidates the items cache after a write', async () => {
      pro.listFields.mockResolvedValue([STATUS_FIELD]);
      pro.findFieldByName.mockResolvedValue(STATUS_FIELD);
      pro.updateItemField.mockResolvedValue({});
      pro.listItems.mockResolvedValue({ status: 'success', data: [] });

      await request(app).get('/items');
      await request(app)
        .patch('/items/item-1/field')
        .set('X-GitHub-Token', 'user-token')
        .send({ name: 'Status', value: 'Done ✅' });
      await request(app).get('/items');

      expect(pro.listItems).toHaveBeenCalledTimes(2);
    });
  });

  describe('sub-issue writes', () => {
    it('links a child issue with the user token', async () => {
      pro.resolveIssueId.mockResolvedValue({
        id: 555,
        number: 10,
        title: 'Child',
        state: 'open',
        html_url: 'https://github.com/giantswarm/giantswarm/issues/10',
        repository: 'giantswarm/giantswarm',
      });
      pro.addSubIssue.mockResolvedValue({
        id: 1,
        number: 42,
        title: 'Parent',
        state: 'open',
        html_url: 'https://github.com/giantswarm/giantswarm/issues/42',
      });

      const response = await request(app)
        .post('/issues/giantswarm/giantswarm/42/sub-issues')
        .set('X-GitHub-Token', 'user-token')
        .send({ child: 'giantswarm/giantswarm#10' });

      expect(response.status).toBe(201);
      expect(pro.resolveIssueId).toHaveBeenCalledWith(
        'giantswarm/giantswarm#10',
        { token: 'user-token' },
      );
      expect(pro.addSubIssue).toHaveBeenCalledWith(
        {
          owner: 'giantswarm',
          repo: 'giantswarm',
          issue_number: 42,
          subIssueId: 555,
        },
        'user-token',
      );
    });

    it('unlinks a child issue', async () => {
      pro.removeSubIssue.mockResolvedValue();

      const response = await request(app)
        .delete('/issues/giantswarm/giantswarm/42/sub-issues/555')
        .set('X-GitHub-Token', 'user-token');

      expect(response.status).toBe(204);
      expect(pro.removeSubIssue).toHaveBeenCalledWith(
        {
          owner: 'giantswarm',
          repo: 'giantswarm',
          issue_number: 42,
          subIssueId: 555,
        },
        'user-token',
      );
    });

    it('rejects sub-issue writes without a user token', async () => {
      const response = await request(app)
        .post('/issues/giantswarm/giantswarm/42/sub-issues')
        .send({ child: 'giantswarm/giantswarm#10' });

      expect(response.status).toBe(401);
      expect(pro.addSubIssue).not.toHaveBeenCalled();
    });
  });
});
