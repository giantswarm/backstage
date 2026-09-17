import type { Page, Route } from '@playwright/test';

import { expect, open, test } from './fixtures';

/**
 * The write side of the Repositories page (giantswarm/backstage#2399)
 * against the same lab as `repositories.spec.ts`: a muster serving
 * giantswarm-repo-manager, `page:repositories` and `api:repositories`
 * enabled, and -- for the last case -- `app.routes.bindings` mapping
 * `catalog.createComponent` to `repositories.create`. Skipped unless
 * AGENTLAB_REPO_MANAGER=1.
 *
 * The dry run runs against the lab's manager for real (it writes nothing).
 * The commit is **stubbed at the browser**: the backend's create route
 * answers with a pull request the way the manager would, and the record of
 * the new repository with its set-up steps converging, so no team-file pull
 * request is opened by a test and the page's behaviour after Create is
 * pinned all the same. Every other call reaches the manager.
 */
const NAME = `e2e-shiny-${Date.now().toString(36)}`;

const pullRequest = {
  number: 4242,
  url: 'https://github.com/giantswarm/github/pull/4242',
  branch: `reposetup/create-${NAME}`,
  title: `feat(repositories): declare ${NAME} for team-bumblebee`,
  author: 'admin',
};

/** The new repository's record while the reconciler sets it up. */
const converging = {
  repository: `giantswarm/${NAME}`,
  name: NAME,
  declaration: {
    team: 'team-bumblebee',
    file: 'repositories/team-bumblebee.yaml',
    componentType: 'service',
    entry: `- name: ${NAME}\n`,
    accepted: true,
  },
  reality: {
    url: `https://github.com/giantswarm/${NAME}`,
    visibility: 'private',
    isArchived: false,
    isFork: false,
    isTemplate: false,
    isEmpty: true,
    createdAt: '2026-09-17T10:00:00Z',
    historySampled: 0,
    botCommits: 0,
    openPullRequests: { total: 0, people: 0, bots: 0, renovate: 0 },
    openIssues: 0,
    has: {},
  },
  renovate: { configured: false, enabled: false, preset: false },
  catalog: { present: false },
  mapping: { present: false },
  setup: {
    checks: {
      repository: `giantswarm/${NAME}`,
      declared: NAME,
      team: 'team-bumblebee',
      mode: 'check',
      added: true,
      startedAt: '2026-09-17T10:00:00Z',
      finishedAt: '2026-09-17T10:00:02Z',
      steps: [
        { step: 'create', verdict: 'ok', summary: 'created' },
        { step: 'scaffold', verdict: 'drift', summary: 'template not applied' },
        { step: 'circleci', verdict: 'drift', changes: ['follow project'] },
      ],
      converged: false,
    },
    checkedAt: '2026-09-17T10:00:02Z',
  },
  orphan: { score: 50, reasons: ['empty repository'] },
  findings: [],
  refreshedAt: '2026-09-17T10:00:02Z',
  source: 'refresh',
  age: '12s',
};

async function fillDeclaration(page: Page) {
  const team = page.getByLabel(/^Team/);
  if (!(await team.inputValue())) {
    await team.fill('team-bumblebee');
  }
  await page.getByLabel(/^Name/).fill(NAME);
  await page.getByLabel(/^Component type/).fill('service');
  await page.getByLabel(/^Language/).fill('go');
  await page.getByLabel(/^Flavours/).fill('app');
}

test.describe('repositories: actions', () => {
  test.skip(
    !process.env.AGENTLAB_REPO_MANAGER,
    'needs a lab whose muster serves giantswarm-repo-manager and whose Backstage enables page:repositories; set AGENTLAB_REPO_MANAGER=1',
  );

  test('Create repository shows the dry run the manager renders', async ({
    admin,
  }) => {
    await open(admin, '/repositories/create');
    await expect(
      admin.getByRole('heading', { name: 'Create repository' }),
    ).toBeVisible();
    await fillDeclaration(admin);
    await admin.getByRole('button', { name: 'Review' }).click();

    const dryRun = admin.getByTestId('dry-run');
    await expect(dryRun).toBeVisible({ timeout: 60_000 });
    // The manager's rendering of the entry, and its verdict on the name
    // (free, taken or unchecked -- the lab's App decides), nothing composed.
    const entry = dryRun.getByTestId(`dry-run-${NAME}`);
    await expect(entry).toContainText(
      new RegExp(`^${NAME}: (accepted|refused) · name \\w+`),
    );
    await expect(entry.getByTestId('entry-entry')).toContainText(
      `- name: ${NAME}`,
    );
    await expect(admin.getByRole('button', { name: 'Create' })).toBeVisible();
  });

  test('Create opens the pull request as the person and the row shows the set-up steps', async ({
    admin,
  }) => {
    const isCreatePath = (url: URL) =>
      url.pathname.endsWith('/repositories/repositories');
    const isRecord = (url: URL) =>
      url.pathname.endsWith(`/repositories/repositories/${NAME}`);
    // The list shares the create path, so the method decides inside the
    // handler; the same references are unrouted below -- a fresh closure
    // would leave the stub on the page for the cases that follow.
    const stubbed = (url: URL) => isCreatePath(url) || isRecord(url);
    const stub = (route: Route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.method() === 'POST' && isCreatePath(url)) {
        return route.fulfill({ json: { pullRequest } });
      }
      if (isRecord(url)) {
        return route.fulfill({ json: converging });
      }
      return route.continue();
    };
    await admin.route(stubbed, stub);
    try {
      await open(admin, '/repositories/create');
      await fillDeclaration(admin);
      await admin.getByRole('button', { name: 'Review' }).click();
      await expect(admin.getByTestId('dry-run')).toBeVisible({
        timeout: 60_000,
      });
      await admin.getByRole('button', { name: 'Create' }).click();

      const opened = admin.getByTestId('pull-request-opened');
      await expect(opened).toBeVisible();
      await expect(
        admin.getByText('Pull request opened as admin'),
      ).toBeVisible();
      await expect(opened).toContainText(`#4242 ${pullRequest.title}`);
      await expect(
        opened.getByRole('link', { name: /Open the pull request/ }),
      ).toHaveAttribute('href', pullRequest.url);

      const live = admin.getByTestId('live-setup');
      await expect(live.getByTestId('setup-state')).toHaveText('not converged');
      const steps = live.getByRole('table', { name: 'Set-up' });
      await expect(steps.getByText('scaffold')).toBeVisible();
      await expect(steps.getByRole('row', { name: /circleci/ })).toContainText(
        'follow project',
      );
    } finally {
      await admin.unroute(stubbed, stub);
    }
  });

  test('Archive names what it does and the team review it asks for, and writes nothing on Cancel', async ({
    admin,
  }) => {
    await open(admin, '/repositories?scope=all');
    const rows = admin
      .getByRole('table', { name: 'Repositories' })
      .locator('tbody tr[data-testid^="row-"]');
    await expect(rows.first()).toBeVisible({ timeout: 60_000 });
    // A declared repository: the team-file actions need an entry.
    const declared = rows
      .filter({ hasNot: admin.getByText('unassigned') })
      .first();
    await expect(declared).toBeVisible();
    const name = (await declared.getAttribute('data-testid'))!.replace(
      /^row-/,
      '',
    );
    await declared.getByRole('button', { name: /^Expand / }).click();

    const record = admin.getByTestId(`record-${name}`);
    await expect(record.getByTestId('row-actions')).toBeVisible({
      timeout: 60_000,
    });
    await record.getByRole('button', { name: 'Archive' }).click();
    const dialog = admin.getByRole('form', {
      name: new RegExp(`^Archive ${name}`),
    });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(
      'archives the repository on GitHub and unfollows it on CircleCI',
    );
    await expect(dialog).toContainText(
      /the ask goes to .*channel, where a member's Approve/,
    );
    await expect(dialog.getByRole('button', { name: 'Review' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
  });

  test('the catalog’s Create… lands on Create repository', async ({
    admin,
  }) => {
    await open(admin, '/catalog');
    const create = admin
      .getByRole('navigation', { name: 'sidebar nav' })
      .getByRole('link', { name: 'Create...' });
    await expect(create).toHaveAttribute('href', '/repositories/create');
    await create.click();
    await expect(admin).toHaveURL(/\/repositories\/create$/);
    await expect(
      admin.getByRole('heading', { name: 'Create repository' }),
    ).toBeVisible();
  });
});
