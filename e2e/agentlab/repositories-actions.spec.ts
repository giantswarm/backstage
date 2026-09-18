import type { Locator, Page, Route } from '@playwright/test';

import { expect, open, test } from './fixtures';

/**
 * The write side of the Repositories page (giantswarm/backstage#2399)
 * against the same lab as `repositories.spec.ts`: a muster serving
 * giantswarm-repo-manager, `page:repositories` and `api:repositories`
 * enabled, and -- for the last case -- `app.routes.bindings` mapping
 * `catalog.createComponent` to `repositories.create`. Skipped unless
 * AGENTLAB_REPO_MANAGER=1.
 *
 * The dry run runs against the lab's manager for real (it writes nothing),
 * as the form runs it -- on its own once the person pauses: a Go service
 * accepted with the CircleCI generator on, a configuration repository with
 * the generator forced on refused until the form's fix turns it off. The commit is
 * **stubbed at the browser**: the backend's create route answers the way
 * the manager does -- the repository, its scaffold commit, the pull request
 * -- and the record of the new repository with its set-up steps converging,
 * so nothing is created by a test and the page's behaviour after Create is
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

/**
 * `create_repository`'s answer in the manager's shape (0.7.0 and later): the
 * repository and its scaffold as the person, then the pull request.
 */
const created = {
  repositories: [
    {
      name: NAME,
      repository: `https://github.com/giantswarm/${NAME}`,
      created: true,
      scaffoldCommit: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
      steps: [
        { step: 'create', verdict: 'repaired', summary: 'created (private)' },
        {
          step: 'scaffold',
          verdict: 'repaired',
          summary: 'pushed as the first commit on main',
        },
      ],
    },
  ],
  pullRequest,
  firstRelease: "v0.1.0 follows from the scaffold's auto-release",
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
  findings: [],
  refreshedAt: '2026-09-17T10:00:02Z',
  source: 'refresh',
  age: '12s',
};

/** The declaration as the form takes it: a kind, a name. */
interface Declaration {
  name: string;
  /** The Kind radio's label. */
  kind: RegExp;
}

/** A Go service: the CircleCI generator has a job, the form's default holds. */
const goService: Declaration = { name: NAME, kind: /^Go service/ };

/**
 * A configuration repository: nothing to build, so the kind turns the
 * CircleCI generator off and the creation rules refuse it when forced on
 * (giantswarm/backstage#2428).
 */
const configuration: Declaration = {
  name: `e2e-configs-${Date.now().toString(36)}`,
  kind: /^Configuration/,
};

/**
 * The team is a choice the form opens on the person's own team with; in the
 * lab the caller's teams may be unreadable, so team-bumblebee is picked when
 * nothing is.
 */
async function fillDeclaration(page: Page, declaration = goService) {
  const team = page.getByRole('button', { name: /Team$/ });
  await expect(team).not.toHaveText(/Reading your teams/);
  if (await team.textContent().then(text => !text?.includes('team-'))) {
    await team.click();
    await page.getByRole('option', { name: /^team-bumblebee/ }).click();
  }
  await kind(page, declaration.kind).click();
  await page.getByLabel(/^Name/).fill(declaration.name);
}

/**
 * The label around a radio's or checkbox's (visually hidden) input: it takes
 * the click -- the input itself is covered by it.
 */
const labelOf = (control: Locator) => control.locator('xpath=ancestor::label');

/** A Kind radio's card. */
const kind = (page: Page, name: RegExp) =>
  labelOf(page.getByRole('radio', { name }));

/** The form's dry run for the declaration as it stands has answered. */
async function answered(page: Page) {
  await expect(page.getByTestId('dry-run')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('dry-run-checking')).toHaveCount(0, {
    timeout: 60_000,
  });
}

const ciGenerate = (page: Page) =>
  page.getByRole('checkbox', { name: 'Generate CircleCI config' });

test.describe('repositories: actions', () => {
  test.skip(
    !process.env.AGENTLAB_REPO_MANAGER,
    'needs a lab whose muster serves giantswarm-repo-manager and whose Backstage enables page:repositories; set AGENTLAB_REPO_MANAGER=1',
  );

  test('Create repository says what it does, opens as a Go service and shows the dry run the manager renders as the form is filled', async ({
    admin,
  }) => {
    await open(admin, '/repositories/create');
    await expect(
      admin.getByRole('heading', { name: 'Create repository' }),
    ).toBeVisible();
    // The order the manager writes as the person: repository, scaffold,
    // then the declaration pull request (giantswarm/backstage#2427).
    await expect(
      admin.getByText(
        /created as you: the repository, one scaffold commit on its default branch/,
      ),
    ).toBeVisible();
    // The defaults: a Go service, private, the generator on; the review
    // waits for a name.
    await expect(
      admin.getByRole('radio', { name: /^Go service/ }),
    ).toBeChecked();
    await expect(admin.getByRole('radio', { name: /^Private/ })).toBeChecked();
    await expect(ciGenerate(admin)).toBeChecked();
    await expect(admin.getByTestId('review-hint')).toBeVisible();
    await expect(admin.getByRole('button', { name: 'Create' })).toBeDisabled();
    await fillDeclaration(admin);
    await answered(admin);

    const dryRun = admin.getByTestId('dry-run');
    // The manager's rendering of the entry, and its verdict on the name
    // (free, taken or unchecked -- the lab's App decides), nothing composed.
    const entry = dryRun.getByTestId(`dry-run-${NAME}`);
    await expect(entry).toContainText(
      new RegExp(`^${NAME}: (accepted|refused) · name \\w+`),
    );
    await expect(entry.getByTestId('entry-entry')).toContainText(
      `- name: ${NAME}`,
    );
    // A Go service keeps the CircleCI generator on.
    await expect(entry.getByTestId('entry-entry')).toContainText(
      'generate: true',
    );
    // The name's verdict under the field, as the manager gave it.
    await expect(admin.getByTestId('name-check')).toContainText(
      new RegExp(`giantswarm/${NAME} is free on GitHub|taken|name unchecked`),
    );
    await expect(admin.getByRole('button', { name: 'Create' })).toBeVisible();
  });

  test('the name is held to the engine’s rule as typed; the manager is not asked until it holds', async ({
    admin,
  }) => {
    await open(admin, '/repositories/create');
    await fillDeclaration(admin, { ...goService, name: 'Shiny-app' });
    await expect(admin.getByLabel(/^Name/)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expect(admin.getByTestId('name-check')).toContainText(
      'the chart is named after the repository',
    );
    await expect(admin.getByTestId('review-hint')).toBeVisible();
    await expect(admin.getByTestId('dry-run')).toHaveCount(0);
    await expect(admin.getByRole('button', { name: 'Create' })).toBeDisabled();
  });

  test('a configuration repository: the kind turns the CircleCI generator off; forced on, the manager refuses it and its fix is one click', async ({
    admin,
  }) => {
    await open(admin, '/repositories/create');
    await fillDeclaration(admin, configuration);
    // The kind: componentType configuration, language generic, the generic
    // flavour, and nothing to build, so the generator is off.
    await expect(
      admin.getByRole('button', { name: /Component type$/ }),
    ).toHaveText(/configuration/);
    await expect(admin.getByRole('button', { name: /Language$/ })).toHaveText(
      /generic/,
    );
    await expect(ciGenerate(admin)).not.toBeChecked();
    await answered(admin);
    const entry = admin.getByTestId(`dry-run-${configuration.name}`);
    await expect(entry).toContainText(`${configuration.name}: accepted`);
    await expect(admin.getByRole('button', { name: 'Create' })).toBeEnabled();

    // Forced on, the creation rules refuse: no CircleCI job for language
    // generic. The refusal names the field and the value to set.
    await labelOf(ciGenerate(admin)).click();
    await answered(admin);
    await expect(entry).toContainText(`${configuration.name}: refused`);
    const problems = entry.getByTestId('problems');
    await expect(problems).toContainText(
      'gen.ci.generate: no CircleCI job for language generic without the app flavour or gen.ci.image.dockerfile; set it to false',
    );
    await expect(admin.getByRole('button', { name: 'Create' })).toBeDisabled();

    // The fix as an action: the switch goes off and the dry run follows.
    await problems
      .getByRole('button', { name: 'Set Generate CircleCI config to off' })
      .click();
    await expect(ciGenerate(admin)).not.toBeChecked();
    await answered(admin);
    await expect(entry).toContainText(`${configuration.name}: accepted`);
    await expect(entry.getByTestId('problems')).toHaveCount(0);
    await expect(entry.getByTestId('entry-entry')).toContainText(
      'generate: false',
    );
    await expect(admin.getByRole('button', { name: 'Create' })).toBeVisible();
  });

  test('Create names the repository, its scaffold commit and the pull request as the person, and the row shows the set-up steps', async ({
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
        return route.fulfill({ json: created });
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
      await answered(admin);
      await admin.getByRole('button', { name: 'Create' }).click();

      // The three artefacts in the order the manager wrote them.
      const result = admin.getByTestId('repository-created');
      await expect(result).toBeVisible();
      await expect(admin.getByText('Created as admin')).toBeVisible();
      await expect(
        result.getByRole('link', { name: `giantswarm/${NAME}` }),
      ).toHaveAttribute('href', `https://github.com/giantswarm/${NAME}`);
      await expect(
        result.getByRole('link', { name: 'a1b2c3d' }),
      ).toHaveAttribute(
        'href',
        `https://github.com/giantswarm/${NAME}/commit/${created.repositories[0].scaffoldCommit}`,
      );
      await expect(result).toContainText(created.firstRelease);
      const opened = result.getByTestId('pull-request-opened');
      await expect(opened).toContainText(`#4242 ${pullRequest.title}`);
      await expect(
        opened.getByRole('link', { name: /Open the pull request/ }),
      ).toHaveAttribute('href', pullRequest.url);

      const live = admin.getByTestId('live-setup');
      await expect(live.getByTestId('setup-state')).toHaveText('not converged');
      const steps = live.getByTestId('setup-steps');
      await expect(steps.getByText('scaffold')).toBeVisible();
      await expect(steps.getByRole('row', { name: /scaffold/ })).toContainText(
        'drift',
      );
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
    const rows = admin.locator('table').first().locator('tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 60_000 });
    // A declared repository: the team-file actions need an entry.
    const declared = rows
      .filter({ hasNot: admin.getByText('unassigned') })
      .first();
    await expect(declared).toBeVisible();
    const name = (await declared.locator('td').nth(1).innerText())
      .trim()
      .replace(/^[^/]+\//, '')
      .split(/\s/)[0];
    await declared
      .getByRole('button', { name: 'Detail panel visiblity toggle' })
      .click();

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

  test('Align now says what it changes; the dry run shows the warning, the opt-in and the planned changes, and writes nothing on Cancel', async ({
    admin,
  }) => {
    await open(admin, '/repositories?scope=all');
    const rows = admin.locator('table').first().locator('tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 60_000 });
    const declared = rows
      .filter({ hasNot: admin.getByText('unassigned') })
      .first();
    await expect(declared).toBeVisible();
    const name = (await declared.locator('td').nth(1).innerText())
      .trim()
      .replace(/^[^/]+\//, '')
      .split(/\s/)[0];
    await declared
      .getByRole('button', { name: 'Detail panel visiblity toggle' })
      .click();

    const record = admin.getByTestId(`record-${name}`);
    await expect(record.getByTestId('row-actions')).toBeVisible({
      timeout: 60_000,
    });
    await expect(
      record.getByRole('button', { name: 'Reconcile now' }),
    ).toHaveCount(0);
    await record.getByRole('button', { name: 'Align now' }).click();
    const dialog = admin.getByRole('form', {
      name: new RegExp(`^Align ${name} now`),
    });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(
      /Changes giantswarm\/\S+ on GitHub and CircleCI to its declared set-up and the company baseline/,
    );
    await expect(dialog).toContainText('as you');
    await dialog.getByRole('button', { name: 'Review' }).click();

    // The manager's dry run (`align_repository`, nothing written): its
    // warning, the team's opt-in line and the changes the last check planned
    // -- or that there is no check yet, or nothing to change.
    const alignment = dialog.getByTestId('alignment');
    await expect(alignment).toBeVisible({ timeout: 60_000 });
    await expect(alignment.getByTestId('alignment-warning')).not.toBeEmpty();
    await expect(alignment.getByTestId('opt-in')).toContainText(
      /has (not )?opted in/,
    );
    await expect(alignment.getByTestId('planned')).toContainText(
      /Planned changes|No check yet|Nothing to change/,
    );
    await expect(alignment.getByTestId('dispatch')).toBeVisible();
    // The confirm label follows the opt-in: Align now applies, Check now only checks.
    const optedIn = /has opted in/.test(
      await alignment.getByTestId('opt-in').innerText(),
    );
    await expect(
      dialog.getByRole('button', { name: optedIn ? 'Align now' : 'Check now' }),
    ).toBeVisible();
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
