import type { Page } from '@playwright/test';
import { expect, open, test, watchPageErrors } from './fixtures';

/**
 * Hive (`/hive`): one sidebar entry with the tabs Now, History, Roadmap,
 * Plans and Knowledge, and the redirects from the pages it replaced. The lab
 * has no GitHub MCP behind its muster, so every plans- and roadmap-backend
 * route the tabs call is answered here with fixtures that follow the
 * magazine's data contract and the board's shape; the pages, their routing
 * and their rendering are the portal's.
 *
 * Hive is disabled by default; the suite is skipped with the reason until
 * AGENTLAB_HIVE=1 says the lab's Backstage names `page:plans`, `api:plans`,
 * `page:roadmap`, `api:roadmap`, `page:plans/plans-redirect` and
 * `page:plans/magazine` in `app.extensions`.
 */
const MAGAZINE = 'giantswarm/team-magazine';
const NOW = '2026-10-05T08:00:00Z';

const card = (n: number, overrides: Record<string, unknown> = {}) => ({
  key: `giantswarm/example#${n}`,
  title: `Customer request ${n}`,
  url: `https://github.com/giantswarm/example/issues/${n}`,
  kind: 'story',
  status: 'In Progress',
  class: 'customer',
  teaser: `Outcome ${n} for the customer.`,
  epic: {
    key: 'giantswarm/roadmap#1',
    title: 'Self-service clusters',
    url: 'https://github.com/giantswarm/roadmap/issues/1',
  },
  customers: ['acme'],
  progress: { done: 2, total: 5 },
  assignees: ['someone'],
  updatedAt: NOW,
  links: [],
  ...overrides,
});

const now = {
  generatedAt: NOW,
  summary: ['Two customer requests move this week.', 'One plan waits.'],
  lanes: [
    {
      id: 'chore',
      title: 'Chores',
      summary: 'Keeping the lights on.',
      total: 0,
      cards: [],
    },
    {
      id: 'customer',
      title: 'Customers',
      summary: 'What customers wait for.',
      total: 6,
      cards: [1, 2, 3, 4, 5, 6].map(n =>
        card(n, n === 1 ? { tryIt: { label: 'Try it', url: '/plans' } } : {}),
      ),
    },
    {
      id: 'top-epic',
      title: 'Top epic',
      summary: 'The product bet.',
      total: 1,
      cards: [card(10, { class: 'top-epic', title: 'Top epic story' })],
    },
    { id: 'setup', title: 'Setup', summary: '', total: 0, cards: [] },
  ],
  reviews: [
    {
      key: 'giantswarm/team-plans#7',
      title: 'Plan: magazine lanes',
      url: 'https://github.com/giantswarm/team-plans/pull/7',
      state: 'review',
      updatedAt: NOW,
      openQuestion: 'Four lanes or three?',
      portalPath: '/plans/pr/7',
    },
  ],
  blocked: [
    card(20, {
      title: 'Blocked story',
      status: 'Blocked / Waiting',
      blocker: { reason: 'Waiting for an upstream release', owner: 'someone' },
    }),
  ],
  upcoming: [card(30, { title: 'Other team work', team: 'Other team' })],
};

const history = {
  window: 'weeks',
  from: '2026-07-05T00:00:00Z',
  to: NOW,
  generatedAt: NOW,
  summary: ['Digest of the weeks window.'],
  stats: { merged: 12, closed: 4, released: 2, epicsMoved: 3 },
  groups: [
    {
      key: 'group-weeks',
      title: 'Epic of the weeks',
      url: 'https://github.com/giantswarm/roadmap/issues/1',
      kind: 'epic',
      teaser: 'Clusters on demand.',
      class: 'top-epic',
      customers: [],
      progress: { from: { done: 1, total: 5 }, to: { done: 3, total: 5 } },
      entries: [
        {
          key: 'giantswarm/example#100',
          title: 'Shipped in weeks',
          url: 'https://github.com/giantswarm/example/pull/100',
          kind: 'pr',
          at: NOW,
          repo: 'giantswarm/example',
          class: 'top-epic',
          customers: ['acme'],
          links: [],
        },
      ],
    },
  ],
  highlights: {
    customers: [{ name: 'acme', keys: ['giantswarm/example#100'] }],
    outsideTeam: [],
  },
  chores: { count: 9, repos: 4, sample: [] },
};

const tree = {
  truncated: false,
  tree: [
    { path: 'knowledge/product/overview.md', type: 'blob' },
    { path: 'knowledge/architecture/data-flow.md', type: 'blob' },
    {
      path: 'knowledge/decisions/2026-09-01-0900-adr-data-branch.md',
      type: 'blob',
    },
  ],
};

const documents: Record<string, string> = {
  'magazine/now.json': JSON.stringify(now),
  'magazine/history-weeks.json': JSON.stringify(history),
  'knowledge/product/overview.md': '# Product overview\n\nWhat we build.',
  'knowledge/architecture/data-flow.md': '# Data flow\n\nHow it moves.',
  'knowledge/decisions/2026-09-01-0900-adr-data-branch.md':
    '# Data branch\n\nGenerated data lives on its own branch.',
};

async function mockPlansBackend(page: Page) {
  await page.route('**/api/plans/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^.*\/api\/plans/, '');
    if (path === '/magazine') {
      await route.fulfill({
        json: {
          configured: true,
          repository: MAGAZINE,
          ref: 'data',
          knowledgeRef: 'main',
        },
      });
      return;
    }
    if (path === '/tree') {
      await route.fulfill({ json: tree });
      return;
    }
    if (path === '/content') {
      const file = url.searchParams.get('path') ?? '';
      const content = documents[file];
      await route.fulfill(
        content === undefined
          ? { status: 404, json: { error: { name: 'NotFoundError' } } }
          : { json: { path: file, ref: url.searchParams.get('ref'), content } },
      );
      return;
    }
    await route.fulfill({ status: 404, json: {} });
  });
}

async function mockRoadmapBackend(page: Page) {
  await page.route('**/api/roadmap/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^.*\/api\/roadmap/, '');
    if (path === '/connection') {
      await route.fulfill({ json: { connected: true } });
      return;
    }
    if (path === '/schema') {
      await route.fulfill({
        json: {
          board: 'roadmap',
          defaultTeams: ['Bumblebee🐝'],
          fields: [
            {
              name: 'Status',
              type: 'singleSelect',
              options: ['Up Next', 'In Progress', 'Done'],
            },
            { name: 'Kind', type: 'singleSelect', options: ['Epic', 'Story'] },
          ],
        },
      });
      return;
    }
    if (path === '/items') {
      const keyword = url.searchParams.get('keyword') ?? '';
      const items = [
        {
          id: 'PVTI_1',
          title: 'Self-service clusters',
          number: 1,
          url: 'https://github.com/giantswarm/roadmap/issues/1',
          repo: 'giantswarm/roadmap',
          private: false,
          fields: { Status: 'In Progress', Kind: 'Epic', Team: 'Bumblebee🐝' },
        },
      ].filter(item => item.title.toLowerCase().includes(keyword));
      await route.fulfill({ json: { items } });
      return;
    }
    await route.fulfill({ status: 404, json: {} });
  });
}

test.describe('Hive', () => {
  test.skip(
    !process.env.AGENTLAB_HIVE,
    'needs a lab whose Backstage enables page:plans, api:plans, page:roadmap, api:roadmap, page:plans/plans-redirect and page:plans/magazine; set AGENTLAB_HIVE=1',
  );

  test.beforeEach(async ({ admin }) => {
    await mockPlansBackend(admin);
    await mockRoadmapBackend(admin);
  });

  test.afterEach(async ({ admin }) => {
    await admin.unroute('**/api/plans/**');
    await admin.unroute('**/api/roadmap/**');
  });

  test('one sidebar entry, the tabs in order', async ({ admin }) => {
    await open(admin, '/');
    const nav = admin.getByRole('navigation').first();
    await expect(nav.getByRole('link', { name: 'Hive' })).toBeVisible();
    for (const gone of ['Plans', 'Roadmap', 'Magazine']) {
      await expect(
        nav.getByRole('link', { name: gone, exact: true }),
      ).toHaveCount(0);
    }

    await open(admin, '/hive');
    await expect(admin).toHaveURL(/\/hive\/now/);
    await expect(admin.getByRole('tab')).toHaveText([
      'Now',
      'History',
      'Roadmap',
      'Plans',
      'Knowledge',
    ]);
  });

  test('Now: lanes in priority order, show all, review and blockers', async ({
    admin,
  }) => {
    const errors = watchPageErrors(admin);
    // A team's view: "Other teams, coming up" drops out for all teams.
    await open(admin, `/hive/now?team=${encodeURIComponent('Bumblebee🐝')}`);

    await expect(admin.getByText('Two customer requests move')).toBeVisible();
    const lanes = admin.locator('section[aria-labelledby^="hive-lane-"]');
    await expect(lanes).toHaveCount(4);
    await expect(lanes.nth(0)).toContainText('Customers');
    await expect(lanes.nth(1)).toContainText('Top epic');
    await expect(lanes.nth(2)).toContainText('Setup');
    await expect(lanes.nth(3)).toContainText('Chores');

    const customers = lanes.nth(0);
    await expect(customers.getByText('Customer request 6')).toHaveCount(0);
    await customers.getByRole('button', { name: /Show all 6/ }).click();
    await expect(customers.getByText('Customer request 6')).toBeVisible();
    await expect(lanes.nth(2).getByText('Nothing open.')).toBeVisible();

    await expect(
      admin.getByRole('grid', { name: 'Plans to grill and review' }),
    ).toContainText('Four lanes or three?');
    await expect(
      admin.getByText('Waiting for an upstream release'),
    ).toBeVisible();
    await expect(
      admin.getByRole('grid', { name: 'Other teams, coming up' }),
    ).toContainText('Other team work');
    expect(errors).toEqual([]);
  });

  test('Now: the header search filters every lane', async ({ admin }) => {
    await open(admin, '/hive/now?team=all&q=Top%20epic%20story');
    const lanes = admin.locator('section[aria-labelledby^="hive-lane-"]');
    await expect(lanes.nth(1)).toContainText('1 of 1');
    await expect(lanes.nth(0)).toContainText('0 of 6');
    await expect(admin.getByText('Customer request 1')).toHaveCount(0);
  });

  test('History: the last three weeks, no window to choose', async ({
    admin,
  }) => {
    await open(admin, '/hive/history?team=all');
    await expect(admin.getByText('Digest of the weeks window.')).toBeVisible();
    await expect(admin.getByText('Epic of the weeks')).toBeVisible();
    await expect(admin.getByText('1 → 3 of 5 done')).toBeVisible();
    await expect(
      admin.getByText('9 chores across 4 repositories.'),
    ).toBeVisible();
    for (const label of ['3 days', '3 weeks', '3 months']) {
      await expect(admin.getByText(label, { exact: true })).toHaveCount(0);
    }
  });

  test('Roadmap: the board with the header team and search', async ({
    admin,
  }) => {
    await open(admin, '/hive/roadmap?team=all');
    await expect(admin.getByText('Self-service clusters')).toBeVisible();
    await open(admin, '/hive/roadmap?team=all&q=nothing-matches');
    await expect(admin.getByText('Self-service clusters')).toHaveCount(0);
  });

  test('Knowledge: documents by category, deep-linked', async ({ admin }) => {
    await open(admin, '/hive/knowledge');
    const nav = admin.getByRole('navigation', { name: 'Knowledge documents' });
    await expect(nav.getByRole('link', { name: 'Overview' })).toBeVisible();
    await expect(
      admin.getByRole('heading', { name: 'Product overview' }),
    ).toBeVisible();

    await nav
      .getByRole('link', { name: 'ADR: Data branch (2026-09-01)' })
      .click();
    await expect(admin).toHaveURL(/doc=knowledge%2Fdecisions%2F/);
    await expect(
      admin.getByRole('heading', { name: 'Data branch' }),
    ).toBeVisible();
  });

  test('the old pages redirect into Hive', async ({ admin }) => {
    // The dropped history window stays behind; the header adds the team.
    await open(admin, '/product?tab=history&window=months');
    await expect(admin).toHaveURL(/\/hive\/history\?team=[^&]+$/);

    await open(
      admin,
      '/product?tab=knowledge&doc=knowledge%2Farchitecture%2Fdata-flow.md',
    );
    await expect(admin).toHaveURL(/\/hive\/knowledge\?doc=/);
    await expect(
      admin.getByRole('heading', { name: 'Data flow' }),
    ).toBeVisible();

    await open(admin, '/roadmap?view=activity');
    await expect(admin).toHaveURL(/\/hive\/roadmap\?.*view=activity/);

    await open(admin, '/plans');
    await expect(admin).toHaveURL(/\/hive\/plans/);
  });
});
