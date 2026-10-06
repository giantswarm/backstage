import type { Page } from '@playwright/test';
import { expect, open, test, watchPageErrors } from './fixtures';

/**
 * The Magazine page (`/product`): Now, History in its three windows, and
 * Knowledge, rendered from the magazine repository's generated JSON. The lab
 * has no GitHub MCP behind its muster, so every plans-backend route the page
 * calls is answered here with fixtures that follow the magazine's data
 * contract; the page, its routing and its rendering are the portal's.
 *
 * The page is disabled by default; the suite is skipped with the reason
 * until AGENTLAB_MAGAZINE_PAGE=1 says the lab's Backstage names
 * `page:plans/magazine` and `api:plans` in `app.extensions`.
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

const history = (window: 'days' | 'weeks' | 'months') => ({
  window,
  from: '2026-07-05T00:00:00Z',
  to: NOW,
  generatedAt: NOW,
  summary: [`Digest of the ${window} window.`],
  stats: { merged: 12, closed: 4, released: 2, epicsMoved: 3 },
  groups: [
    {
      key: `group-${window}`,
      title: `Epic of the ${window}`,
      url: 'https://github.com/giantswarm/roadmap/issues/1',
      kind: window === 'months' ? 'area' : 'epic',
      teaser: 'Clusters on demand.',
      class: 'top-epic',
      customers: [],
      progress: { from: { done: 1, total: 5 }, to: { done: 3, total: 5 } },
      entries: [
        {
          key: 'giantswarm/example#100',
          title: `Shipped in ${window}`,
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
});

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
  'magazine/history-days.json': JSON.stringify(history('days')),
  'magazine/history-weeks.json': JSON.stringify(history('weeks')),
  'magazine/history-months.json': JSON.stringify(history('months')),
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

test.describe('product magazine', () => {
  test.skip(
    !process.env.AGENTLAB_MAGAZINE_PAGE,
    'needs a lab whose Backstage enables page:plans/magazine and api:plans; set AGENTLAB_MAGAZINE_PAGE=1',
  );

  test.beforeEach(async ({ admin }) => {
    await mockPlansBackend(admin);
  });

  test.afterEach(async ({ admin }) => {
    await admin.unroute('**/api/plans/**');
  });

  test('Now: lanes in priority order, show all, review and blockers', async ({
    admin,
  }) => {
    const errors = watchPageErrors(admin);
    await open(admin, '/product');

    await expect(admin.getByText('Two customer requests move')).toBeVisible();
    const lanes = admin.locator('section h3');
    await expect(lanes.nth(1)).toHaveText('Customers');
    await expect(lanes.nth(2)).toHaveText('Top epic');
    await expect(lanes.nth(3)).toHaveText('Setup');
    await expect(lanes.nth(4)).toHaveText('Chores');

    const customers = admin.getByRole('region', { name: 'Customers' });
    await expect(customers.getByRole('heading', { level: 4 })).toHaveCount(4);
    await customers.getByRole('button', { name: /Show all 6/ }).click();
    await expect(customers.getByRole('heading', { level: 4 })).toHaveCount(6);
    await expect(customers.getByText('2 of 5 done').first()).toBeVisible();
    await expect(
      customers.getByRole('link', { name: 'Try it' }),
    ).toHaveAttribute('href', '/plans');

    await expect(
      admin
        .getByRole('region', { name: 'Setup' })
        .getByText('Nothing in this lane right now.'),
    ).toBeVisible();

    const review = admin.getByRole('region', { name: 'Needs review' });
    await expect(review.getByText('Open question: Four lanes')).toBeVisible();
    const blocked = admin.getByRole('region', { name: 'Blocked', exact: true });
    await expect(blocked.getByRole('note', { name: 'Blocked' })).toContainText(
      'Waiting for an upstream release',
    );
    await expect(
      admin.getByRole('region', { name: 'Upcoming from other teams' }),
    ).toContainText('Other team work');
    expect(errors).toEqual([]);
  });

  test('History: three windows, shareable in the URL', async ({ admin }) => {
    await open(admin, '/product?tab=history');
    await expect(admin.getByText('Digest of the days window.')).toBeVisible();
    // The entry is listed under its group and linked again from Highlights.
    for (const section of ['What moved', 'Highlights']) {
      await expect(
        admin
          .getByRole('region', { name: section })
          .getByRole('link', { name: 'Shipped in days' }),
      ).toBeVisible();
    }

    for (const [label, window] of [
      ['3 weeks', 'weeks'],
      ['3 months', 'months'],
      ['3 days', 'days'],
    ] as const) {
      await admin
        .getByRole('radio', { name: label })
        .or(admin.getByRole('button', { name: label }))
        .click();
      await expect(admin).toHaveURL(new RegExp(`window=${window}`));
      await expect(
        admin.getByText(`Digest of the ${window} window.`),
      ).toBeVisible();
      await expect(admin.getByText('1 → 3 of 5 done')).toBeVisible();
    }

    await open(admin, '/product?tab=history&window=months');
    await expect(admin.getByText('Epic of the months')).toBeVisible();
    await expect(
      admin.getByText('9 chores across 4 repositories.'),
    ).toBeVisible();
  });

  test('Knowledge: documents by category, deep-linked', async ({ admin }) => {
    await open(admin, '/product?tab=knowledge');
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

    await open(
      admin,
      '/product?tab=knowledge&doc=knowledge%2Farchitecture%2Fdata-flow.md',
    );
    await expect(
      admin.getByRole('heading', { name: 'Data flow' }),
    ).toBeVisible();
  });
});
