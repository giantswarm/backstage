import type { Page } from '@playwright/test';
import { expect, open, test, watchPageErrors } from './fixtures';
import { contextOptions } from './lab';

/**
 * Hive (`/hive`): one sidebar entry with the tabs Now, History, Roadmap,
 * Plans and Knowledge, and the redirects from the pages it replaced. The lab
 * has no GitHub MCP behind its muster, so every plans-backend route the tabs
 * call is answered here with fixtures that follow the magazine's data
 * contract; the pages, their routing and their rendering are the portal's.
 *
 * The roadmap-backend routes are answered here too, from a board of the same
 * shape, unless AGENTLAB_ROADMAP_FIXTURE=1 says the lab's muster serves its
 * fake pro (`agentlab roadmap-test --keep`, on a lab with `agentlab configure
 * --hive`): the Roadmap tab then reads the portal's own roadmap-backend, which
 * reads that fixture board through muster as the signed-in person.
 *
 * Hive is disabled by default; the suite is skipped with the reason until
 * AGENTLAB_HIVE=1 says the lab's Backstage names `page:plans`, `api:plans`,
 * `page:roadmap`, `api:roadmap`, `page:plans/plans-redirect` and
 * `page:plans/magazine` in `app.extensions`.
 */
/** The lab's muster serves agentlab's fake pro board: real roadmap routes. */
const ROADMAP_FIXTURE = Boolean(process.env.AGENTLAB_ROADMAP_FIXTURE);

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
    // Another team's card: the magazine names it, without the emoji.
    {
      id: 'setup',
      title: 'Setup',
      summary: '',
      total: 1,
      cards: [
        card(40, {
          class: 'setup',
          title: 'Phoenix setup work',
          team: 'Phoenix',
        }),
      ],
    },
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

// Generated titles carry unbroken paths, links and code.
const UNBROKEN_TITLE =
  'giantswarm/cluster-api-provider-aws/controllers/awsmachinepool_controller_reconcile_launch_template_versions';

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
        {
          key: 'giantswarm/example#102',
          title: 'Phoenix shipped in weeks',
          url: 'https://github.com/giantswarm/example/pull/102',
          kind: 'pr',
          at: NOW,
          repo: 'giantswarm/example',
          class: 'top-epic',
          customers: [],
          team: 'Phoenix',
          links: [],
        },
      ],
    },
    {
      key: 'group-unbroken',
      title: UNBROKEN_TITLE,
      url: 'https://github.com/giantswarm/roadmap/issues/2',
      kind: 'area',
      teaser:
        'Pinned in https://github.com/giantswarm/example/blob/main/controllers/awsmachinepool_controller.go#L412-L468 via `kubectl get awsmachinepools.infrastructure.cluster.x-k8s.io --output=jsonpath={.items[*].status.launchTemplateVersion}`.',
      class: 'setup',
      customers: [],
      entries: [
        {
          key: 'giantswarm/example#101',
          title:
            'Reconcile_LaunchTemplateVersions_when_the_AWSMachinePool_spec_changes_without_a_rolling_update',
          url: 'https://github.com/giantswarm/example/issues/101',
          kind: 'issue',
          at: NOW,
          repo: 'giantswarm/example',
          class: 'setup',
          customers: [],
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
    { path: 'knowledge/architecture/diagrams.md', type: 'blob' },
    {
      path: 'knowledge/decisions/2026-09-01-0900-adr-data-branch.md',
      type: 'blob',
    },
    // A plan, merged: the Plans tab's Merged view reads it.
    { path: 'plan/PRD.md', type: 'blob' },
    { path: 'plan/design/operations.md', type: 'blob' },
  ],
};

// The magazine follows one team: an item without a `team` is this team's.
const meta = {
  version: 1,
  generatedAt: NOW,
  sources: { board: 273, team: 'Bumblebee' },
};

const PLANS_REPOSITORIES = [
  'giantswarm/meadow-plans',
  'giantswarm/orchard-plans',
];

/** The changed documents of the mocked pull request (`/pulls/1/files`). */
const PLAN_DOCUMENT = 'plan/PRD.md';
const PLAN_DESIGN = 'plan/design/operations.md';
const PLAN_BRANCH = 'plan';

/**
 * The page opens `doc` at `hash` (and `params`), whatever parameters the
 * header adds besides.
 */
const opensDocument =
  (doc: string, hash: string, params: Record<string, string> = {}) =>
  (url: URL) =>
    url.searchParams.get('doc') === doc &&
    url.hash === hash &&
    Object.entries(params).every(
      ([name, value]) => url.searchParams.get(name) === value,
    );

/** Paragraphs that push what follows them out of the first screen. */
const filler = (label: string) =>
  Array.from({ length: 30 }, (_, n) => `${label} paragraph ${n + 1}.\n`);

const documents: Record<string, string> = {
  [PLAN_DOCUMENT]: [
    '# Plan: diagrams in review',
    '',
    '## Solution',
    '',
    '```mermaid',
    'flowchart LR',
    '  Reviewer --> Plans[Plans view]',
    '```',
    '',
    'After the diagram.',
    '',
    ...filler('Solution'),
    '## Links',
    '',
    '- [Operations](design/operations.md)',
    '- [Failures](design/operations.md#failures-and-retries)',
    '- [Back to the solution](#solution)',
    '- [Design folder](design/)',
  ].join('\n'),
  [PLAN_DESIGN]: [
    '# Operations',
    '',
    ...filler('Operations'),
    '## Failures and retries',
    '',
    'A failed run is retried.',
  ].join('\n'),
  'magazine/meta.json': JSON.stringify(meta),
  'magazine/now.json': JSON.stringify(now),
  'magazine/history-weeks.json': JSON.stringify(history),
  'knowledge/product/overview.md': '# Product overview\n\nWhat we build.',
  'knowledge/architecture/data-flow.md': '# Data flow\n\nHow it moves.',
  'knowledge/architecture/diagrams.md': [
    '# Diagrams',
    '',
    '```mermaid',
    'graph TD',
    '  Board --> Magazine',
    '```',
    '',
    'Between the diagrams.',
    '',
    '```mermaid',
    'sequenceDiagram',
    '  Portal->>Backend: read the document',
    '```',
    '',
    '```mermaid',
    'graph TD',
    '  A -->',
    '```',
  ].join('\n'),
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
    if (path === '/repos') {
      await route.fulfill({ json: { repositories: PLANS_REPOSITORIES } });
      return;
    }
    if (path === '/pulls') {
      const repo = url.searchParams.get('repo') ?? '';
      await route.fulfill({
        json: {
          pulls: [
            {
              number: 1,
              title: `A plan in ${repo}`,
              author: 'someone',
              draft: false,
              branch: PLAN_BRANCH,
              updatedAt: NOW,
              body: '',
            },
          ],
        },
      });
      return;
    }
    if (path === '/pulls/1/files') {
      await route.fulfill({
        json: {
          files: [PLAN_DOCUMENT, PLAN_DESIGN].map(filename => ({
            filename,
            status: 'added',
            additions: documents[filename].split('\n').length,
            deletions: 0,
          })),
        },
      });
      return;
    }
    if (path === '/pulls/1/comments' || path === '/pulls/1/review-comments') {
      await route.fulfill({ json: { comments: [] } });
      return;
    }
    if (path === '/epics') {
      await route.fulfill({ json: { merged: [], pulls: [] } });
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
    if (!ROADMAP_FIXTURE) {
      await mockRoadmapBackend(admin);
    }
  });

  test.afterEach(async ({ admin }) => {
    await admin.unroute('**/api/plans/**');
    await admin.unroute('**/api/roadmap/**');
  });

  test('one sidebar entry, the tabs in order', async ({ admin }) => {
    // A classic page: on a lab serving the shell, `/` is the shell's.
    await open(admin, '/catalog');
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

  for (const width of [1280, 768]) {
    test(`History at ${width} px: long titles, links and code stay in their card`, async ({
      admin,
    }) => {
      await admin.setViewportSize({ width, height: 900 });
      try {
        await open(admin, '/hive/history?team=all');
        await expect(admin.getByText(UNBROKEN_TITLE)).toBeVisible();
        const layout = await admin.evaluate(() => {
          const page = document.scrollingElement!;
          const section = document.querySelector(
            'section[aria-labelledby="hive-history-moved"]',
          )!;
          const area = section.getBoundingClientRect();
          const cards = [
            ...section.querySelectorAll<HTMLElement>('[class*="bui-Card"]'),
          ].filter(el => !el.parentElement?.closest('[class*="bui-Card"]'));
          return {
            pageOverflow: page.scrollWidth - page.clientWidth,
            cards: cards.length,
            outside: cards.filter(
              el => el.getBoundingClientRect().right > area.right + 0.5,
            ).length,
            scrolling: cards.filter(el => el.scrollWidth > el.clientWidth + 1)
              .length,
          };
        });
        expect(layout.cards, 'both history cards render').toBe(2);
        expect(layout.pageOverflow, 'no horizontal page scroll').toBe(0);
        expect(layout.outside, 'every card ends within the content area').toBe(
          0,
        );
        expect(layout.scrolling, 'no card scrolls sideways').toBe(0);
      } finally {
        await admin.setViewportSize(contextOptions.viewport);
      }
    });
  }

  test('the header team narrows Now and History', async ({ admin }) => {
    const phoenix = encodeURIComponent('Phoenix 🔥');
    const bumblebee = encodeURIComponent('Bumblebee🐝');

    await open(admin, `/hive/now?team=${phoenix}`);
    await expect(admin.getByText('Hive follows Team Bumblebee')).toBeVisible();
    await expect(admin.getByText('Phoenix setup work')).toBeVisible();
    await expect(admin.getByText('Customer request 1')).toHaveCount(0);
    await expect(admin.getByText('Two customer requests move')).toHaveCount(0);
    // The lanes stay, without Bumblebee's descriptions of them.
    await expect(
      admin.getByRole('heading', { name: 'Customers', exact: true }),
    ).toBeVisible();
    await expect(admin.getByText('What customers wait for.')).toHaveCount(0);
    await expect(admin.getByText('Keeping the lights on.')).toHaveCount(0);

    await open(admin, `/hive/now?team=${bumblebee}`);
    await expect(admin.getByText('Customer request 1')).toBeVisible();
    await expect(admin.getByText('What customers wait for.')).toBeVisible();
    await expect(admin.getByText('Phoenix setup work')).toHaveCount(0);
    await expect(admin.getByText('Hive follows Team Bumblebee')).toHaveCount(0);

    await open(admin, `/hive/history?team=${phoenix}`);
    await expect(admin.getByText('Epic of the weeks')).toBeVisible();
    await expect(admin.getByText(UNBROKEN_TITLE)).toHaveCount(0);
    await expect(admin.getByText('Digest of the weeks window.')).toHaveCount(0);

    await open(admin, `/hive/history?team=${bumblebee}`);
    await expect(admin.getByText(UNBROKEN_TITLE)).toBeVisible();
    await expect(admin.getByText('Digest of the weeks window.')).toBeVisible();
  });

  test("the header team reads the team's own data set; a team without one shows an empty state", async ({
    admin,
  }) => {
    // The magazine writes one data set per team (`magazine/teams.json`).
    const phoenixMeta = { ...meta, sources: { board: 273, team: 'Phoenix' } };
    const phoenixNow = {
      ...now,
      summary: ['Phoenix ships the cluster upgrade.'],
      lanes: [
        {
          id: 'customer',
          title: 'Customers',
          summary: '',
          total: 1,
          cards: [
            card(50, { title: 'Phoenix customer request', team: 'Phoenix' }),
          ],
        },
      ],
      blocked: [],
      upcoming: [],
    };
    const phoenixHistory = {
      ...history,
      summary: ['Phoenix closed the upgrade epic.'],
      groups: [{ ...history.groups[0], title: 'Phoenix upgrade epic' }],
    };
    const sets: Record<string, unknown> = {
      'magazine/teams.json': {
        version: 1,
        generatedAt: NOW,
        default: 'Bumblebee',
        teams: [
          {
            name: 'Bumblebee',
            boardTeam: 'Bumblebee🐝',
            slug: 'bumblebee',
            path: 'magazine/teams/bumblebee',
          },
          {
            name: 'Phoenix',
            boardTeam: 'Phoenix 🔥',
            slug: 'phoenix',
            path: 'magazine/teams/phoenix',
          },
        ],
      },
      'magazine/teams/bumblebee/meta.json': meta,
      'magazine/teams/bumblebee/now.json': now,
      'magazine/teams/bumblebee/history-weeks.json': history,
      'magazine/teams/phoenix/meta.json': phoenixMeta,
      'magazine/teams/phoenix/now.json': phoenixNow,
      'magazine/teams/phoenix/history-weeks.json': phoenixHistory,
    };
    await admin.route('**/api/plans/content?*', async route => {
      const url = new URL(route.request().url());
      const file = url.searchParams.get('path') ?? '';
      if (!(file in sets)) {
        await route.fallback();
        return;
      }
      await route.fulfill({
        json: { path: file, ref: 'data', content: JSON.stringify(sets[file]) },
      });
    });
    try {
      const errors = watchPageErrors(admin);

      await open(admin, `/hive/now?team=${encodeURIComponent('Phoenix 🔥')}`);
      await expect(admin.getByText('Phoenix customer request')).toBeVisible();
      await expect(
        admin.getByText('Phoenix ships the cluster upgrade.'),
      ).toBeVisible();
      await expect(admin.getByText('Hive follows Team Bumblebee')).toHaveCount(
        0,
      );
      await expect(admin.getByText('Customer request 1')).toHaveCount(0);

      await open(
        admin,
        `/hive/history?team=${encodeURIComponent('Phoenix 🔥')}`,
      );
      await expect(admin.getByText('Phoenix upgrade epic')).toBeVisible();
      await expect(
        admin.getByText('Phoenix closed the upgrade epic.'),
      ).toBeVisible();

      for (const tab of ['now', 'history']) {
        await open(admin, `/hive/${tab}?team=${encodeURIComponent('Up 🎈')}`);
        await expect(
          admin.getByText('No magazine data for Team Up yet'),
        ).toBeVisible();
        await expect(admin.getByText(/Failed to load/)).toHaveCount(0);
      }

      await open(admin, `/hive/now?team=${encodeURIComponent('Bumblebee🐝')}`);
      await expect(admin.getByText('Customer request 1')).toBeVisible();
      expect(errors).toEqual([]);
    } finally {
      await admin.unroute('**/api/plans/content?*');
    }
  });

  test('Plans: the header team picks its plans repository', async ({
    admin,
  }) => {
    await open(admin, `/hive/plans?team=${encodeURIComponent('Orchard 🍎')}`);
    await expect(
      admin.getByText('A plan in giantswarm/orchard-plans'),
    ).toBeVisible();
    await expect(admin.getByRole('button', { name: /Repository/ })).toHaveCount(
      0,
    );

    await open(admin, `/hive/plans?team=${encodeURIComponent('Phoenix 🔥')}`);
    await expect(
      admin.getByText('Team Phoenix has no plans here'),
    ).toBeVisible();
  });

  test('Roadmap: the board with the header team and search', async ({
    admin,
  }) => {
    await open(admin, '/hive/roadmap?team=all');
    await expect(admin.getByText('Self-service clusters')).toBeVisible();
    if (ROADMAP_FIXTURE) {
      // The fake pro's board, read through the roadmap-backend and muster:
      // items the mocked board does not have, another team's among them.
      await expect(
        admin.getByText('Cluster templates in the portal'),
      ).toBeVisible();
      await expect(admin.getByText('Phoenix storage migration')).toBeVisible();
    }
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

  test('Knowledge: Mermaid blocks render as diagrams, an invalid one as its source', async ({
    admin,
  }) => {
    const errors = watchPageErrors(admin);
    await open(
      admin,
      '/hive/knowledge?doc=knowledge%2Farchitecture%2Fdiagrams.md',
    );
    const article = admin.getByRole('article', { name: 'Diagrams' });
    await expect(
      article.getByRole('heading', { name: 'Diagrams' }),
    ).toBeVisible();

    const diagrams = article.getByTestId('mermaid-diagram');
    await expect(diagrams).toHaveCount(2);
    await expect(diagrams.nth(0).locator('svg')).toBeVisible();
    await expect(diagrams.nth(0)).toContainText('Magazine');
    await expect(diagrams.nth(1).locator('svg')).toBeVisible();
    await expect(article.getByText('Between the diagrams.')).toBeVisible();
    // The valid diagrams' sources do not show as code.
    await expect(article.getByText('Board --> Magazine')).toHaveCount(0);

    await expect(article.getByRole('note')).toContainText(
      'could not be rendered',
    );
    await expect(article.locator('code.language-mermaid')).toHaveText(
      'graph TD\n  A -->',
    );
    expect(errors).toEqual([]);
  });

  test('Plans: a pull request’s document draws its Mermaid diagram in the light and the dark theme', async ({
    admin,
  }) => {
    const errors = watchPageErrors(admin);
    const review = `/hive/plans/pr/1?repo=${encodeURIComponent(
      PLANS_REPOSITORIES[0],
    )}&doc=${encodeURIComponent(PLAN_DOCUMENT)}`;
    /** Relative luminance (0–1) of a CSS `rgb(…)` colour. */
    const luminance = (rgb: string) => {
      const [r, g, b] = (rgb.match(/\d+(\.\d+)?/g) ?? []).map(Number);
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    };

    try {
      for (const colorScheme of ['light', 'dark'] as const) {
        await admin.emulateMedia({ colorScheme });
        await open(admin, review);
        await expect(
          admin.getByRole('heading', { name: 'Solution' }),
        ).toBeVisible();

        const diagram = admin.getByTestId('mermaid-diagram');
        await expect(diagram.locator('svg')).toBeVisible();
        await expect(diagram).toContainText('Plans view');
        // The source does not show as code next to it.
        await expect(admin.locator('code.language-mermaid')).toHaveCount(0);
        await expect(admin.getByText('After the diagram.')).toBeVisible();
        // The fence (line 5) stays commentable like any other block.
        await expect(
          admin.getByLabel('Comment on line 5', { exact: true }),
        ).toBeAttached();

        // Mermaid's light palette in the light theme, its dark one in dark.
        const fill = await diagram
          .locator('.node rect')
          .first()
          .evaluate(node => getComputedStyle(node).fill);
        if (colorScheme === 'light') {
          expect(luminance(fill), `node fill ${fill}`).toBeGreaterThan(0.5);
        } else {
          expect(luminance(fill), `node fill ${fill}`).toBeLessThan(0.5);
        }
      }
    } finally {
      await admin.emulateMedia({ colorScheme: null });
    }
    expect(errors).toEqual([]);
  });

  test('Plans: a pull request’s document links into its other documents, their sections, its own headings and GitHub', async ({
    admin,
  }) => {
    const errors = watchPageErrors(admin);
    const repo = PLANS_REPOSITORIES[0];
    await open(
      admin,
      `/hive/plans/pr/1?repo=${encodeURIComponent(repo)}&doc=${encodeURIComponent(
        PLAN_DOCUMENT,
      )}`,
    );
    const solution = admin.getByRole('heading', { name: 'Solution' });
    await expect(solution).toBeVisible();

    // A document of the pull request opens here, at its start.
    await admin.getByRole('link', { name: 'Operations', exact: true }).click();
    await expect(admin).toHaveURL(opensDocument(PLAN_DESIGN, '#top'));
    await expect(
      admin.getByRole('heading', { name: 'Operations', exact: true }),
    ).toBeInViewport();

    // A section of another document opens that document at the section.
    await admin.goBack();
    await expect(solution).toBeVisible();
    await admin.getByRole('link', { name: 'Failures', exact: true }).click();
    await expect(admin).toHaveURL(
      opensDocument(PLAN_DESIGN, '#failures-and-retries'),
    );
    await expect(
      admin.getByRole('heading', { name: 'Failures and retries' }),
    ).toBeInViewport();

    // A heading of the same document is a jump within it.
    await admin.goBack();
    await admin.getByRole('link', { name: 'Back to the solution' }).click();
    await expect(solution).toBeInViewport();

    // A folder opens on GitHub at the head branch, in a new tab.
    const folder = admin.getByRole('link', { name: /^Design folder/ });
    const url = `https://github.com/${repo}/tree/${PLAN_BRANCH}/plan/design`;
    await expect(folder).toHaveAttribute('href', url);
    await admin.context().route('https://github.com/**', route =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: 'GitHub',
      }),
    );
    try {
      const [github] = await Promise.all([
        admin.waitForEvent('popup'),
        folder.click(),
      ]);
      await github.waitForLoadState();
      expect(github.url()).toBe(url);
      await github.close();
    } finally {
      await admin.context().unroute('https://github.com/**');
    }
    expect(errors).toEqual([]);
  });

  test('Plans: a merged plan’s document links into its other documents and their sections', async ({
    admin,
  }) => {
    const repo = PLANS_REPOSITORIES[0];
    await open(
      admin,
      `/hive/plans?team=all&repo=${encodeURIComponent(repo)}&plan=plan`,
    );
    await admin.getByRole('link', { name: 'Failures', exact: true }).click();
    await expect(admin).toHaveURL(
      opensDocument(PLAN_DESIGN, '#failures-and-retries', { plan: 'plan' }),
    );
    await expect(
      admin.getByRole('heading', { name: 'Failures and retries' }),
    ).toBeInViewport();
    await expect(
      admin.getByRole('link', { name: /^Design folder/ }),
    ).toHaveAttribute(
      'href',
      `https://github.com/${repo}/tree/HEAD/plan/design`,
    );
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
