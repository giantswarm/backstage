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
 * -- the follow (`watch_repository`) answers the phases reached, first with
 * the pull request open and then every phase done, and the record of the new
 * repository comes with its set-up steps, so nothing is created by a test and
 * the page's behaviour after Create is pinned all the same. Every other call
 * reaches the manager.
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

/** When each phase of the creation was reached: 4 min 10 s to a green release. */
const reachedAt = {
  created: '2026-09-17T10:00:00Z',
  scaffolded: '2026-09-17T10:00:04Z',
  declared: '2026-09-17T10:00:13Z',
  merged: '2026-09-17T10:01:15Z',
  setUp: '2026-09-17T10:02:29Z',
  released: '2026-09-17T10:04:10Z',
};

const phaseOf = (name: keyof typeof reachedAt, seconds: number) => ({
  name,
  at: reachedAt[name],
  seconds,
});

/**
 * `watch_repository`'s answers in the manager's shape: the first call finds
 * the pull request open and returns on its timeout with `merged` pending;
 * the second finds every phase done and the first release green.
 */
const watching = {
  repository: `https://github.com/giantswarm/${NAME}`,
  pullRequest: pullRequest.url,
  phases: [
    phaseOf('created', 0),
    phaseOf('scaffolded', 4),
    phaseOf('declared', 9),
  ],
  changed: false,
  ready: false,
  pending: 'merged',
  waited: 20,
};

const ready = {
  ...watching,
  phases: [
    ...watching.phases,
    phaseOf('merged', 62),
    phaseOf('setUp', 74),
    phaseOf('released', 101),
  ],
  changed: true,
  ready: true,
  pending: undefined,
  release: {
    tag: 'v0.1.0',
    url: `https://github.com/giantswarm/${NAME}/releases/tag/v0.1.0`,
  },
  waited: 3,
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

/** The declaration as the form takes it: a preset, a name. */
interface Declaration {
  name: string;
  /** The preset radio's label. */
  preset: RegExp;
}

/** A Go service: the CircleCI generator has a job, the form's default holds. */
const goService: Declaration = { name: NAME, preset: /^Go service/ };

/**
 * A configuration repository: nothing to build, so the preset turns the
 * CircleCI generator off and the creation rules refuse it when forced on
 * (giantswarm/backstage#2428).
 */
const configuration: Declaration = {
  name: `e2e-configs-${Date.now().toString(36)}`,
  preset: /^Configuration/,
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
  await preset(page, declaration.preset).click();
  await page.getByLabel(/^Name/).fill(declaration.name);
}

/**
 * The label around a radio's or checkbox's (visually hidden) input: it takes
 * the click -- the input itself is covered by it.
 */
const labelOf = (control: Locator) => control.locator('xpath=ancestor::label');

/** A preset radio's card. */
const preset = (page: Page, name: RegExp) =>
  labelOf(page.getByRole('radio', { name }));

/** The declaration's one-line summary: `service · go · app · CircleCI config generated`. */
const summary = (page: Page) => page.getByTestId('declaration-summary');

/** Adjust opens the declaration's raw controls. */
const adjust = (page: Page) =>
  page.getByRole('button', { name: 'Adjust' }).click();

/** The form's dry run for the declaration as it stands has answered. */
async function answered(page: Page) {
  await expect(page.getByTestId('dry-run')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('dry-run-checking')).toHaveCount(0, {
    timeout: 60_000,
  });
}

const ciGenerate = (page: Page) =>
  page.getByRole('checkbox', { name: 'Generate CircleCI config' });

/**
 * The first declared repository of the All scope with its row expanded --
 * the team-file actions need an entry: its name as the row shows it, and the
 * expanded record with the row actions.
 */
async function expandDeclared(page: Page) {
  await open(page, '/repositories?scope=all');
  const rows = page.locator('table').first().locator('tbody tr');
  await expect(rows.first()).toBeVisible({ timeout: 60_000 });
  const declared = rows
    .filter({ hasNot: page.getByText('unassigned') })
    .first();
  await expect(declared).toBeVisible();
  const name = (await declared.locator('td').nth(1).innerText())
    .trim()
    .replace(/^[^/]+\//, '')
    .split(/\s/)[0];
  await declared
    .getByRole('button', { name: 'Detail panel visiblity toggle' })
    .click();
  const record = page.getByTestId(`record-${name}`);
  await expect(record.getByTestId('row-actions')).toBeVisible({
    timeout: 60_000,
  });
  return { name, record };
}

/**
 * The first undeclared repository of the Unassigned scope, expanded to its
 * record with the row actions -- the rows read `unassigned` in place of a
 * team. Skips the test when the lab's inventory has none.
 */
async function expandUndeclared(page: Page) {
  await open(page, '/repositories?scope=unassigned');
  await expect(page.getByTestId('listing-summary')).toContainText(
    /matching repositories/,
    { timeout: 60_000 },
  );
  const rows = page.locator('table').first().locator('tbody tr');
  const undeclared = rows.filter({ has: page.getByText('unassigned') }).first();
  test.skip(
    (await undeclared.count()) === 0,
    'the lab inventory has no undeclared repository',
  );
  const name = (await undeclared.locator('td').nth(1).innerText())
    .trim()
    .replace(/^[^/]+\//, '')
    .split(/\s/)[0];
  await undeclared
    .getByRole('button', { name: 'Detail panel visiblity toggle' })
    .click();
  const record = page.getByTestId(`record-${name}`);
  await expect(record.getByTestId('row-actions')).toBeVisible({
    timeout: 60_000,
  });
  return { name, record };
}

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
    // The defaults: a Go service, private, the declaration as the preset's
    // result with the generator on; the review waits for a name.
    await expect(
      admin.getByRole('radio', { name: /^Go service/ }),
    ).toBeChecked();
    await expect(admin.getByRole('radio', { name: /^Private/ })).toBeChecked();
    await expect(summary(admin)).toHaveText(
      'service · go · app · CircleCI config generated',
    );
    await expect(admin.getByTestId('declaration-source')).toHaveText(
      'Set by the Go service preset.',
    );
    await expect(admin.getByTestId('declaration-fields')).toHaveCount(0);
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

  test('a configuration repository: the preset turns the CircleCI generator off; forced on behind Adjust, the manager refuses it and its fix is one click', async ({
    admin,
  }) => {
    await open(admin, '/repositories/create');
    await fillDeclaration(admin, configuration);
    // The preset: componentType configuration, language generic, the generic
    // nature, and nothing to build, so the generator is off.
    await expect(summary(admin)).toHaveText(
      'configuration · generic · generic · CircleCI config not generated',
    );
    await answered(admin);
    const entry = admin.getByTestId(`dry-run-${configuration.name}`);
    await expect(entry).toContainText(`${configuration.name}: accepted`);
    await expect(admin.getByRole('button', { name: 'Create' })).toBeEnabled();

    // The raw controls behind Adjust: the catalog type, the language, the
    // nature as one choice, the add-ons, the CircleCI switch.
    await adjust(admin);
    await expect(
      admin.getByRole('button', { name: /Catalog type$/ }),
    ).toHaveText(/configuration/);
    await expect(admin.getByRole('button', { name: /Language$/ })).toHaveText(
      /generic/,
    );
    await expect(admin.getByRole('radio', { name: 'generic' })).toBeChecked();
    await expect(
      admin.getByRole('checkbox', { name: 'cluster-app' }),
    ).toBeDisabled();
    await expect(ciGenerate(admin)).not.toBeChecked();

    // Forced on, the creation rules refuse: no CircleCI job for language
    // generic. The refusal names the field and the value to set.
    await labelOf(ciGenerate(admin)).click();
    await expect(summary(admin)).toHaveText(/CircleCI config generated$/);
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
    await expect(summary(admin)).toHaveText(/CircleCI config not generated$/);
    await answered(admin);
    await expect(entry).toContainText(`${configuration.name}: accepted`);
    await expect(entry.getByTestId('problems')).toHaveCount(0);
    await expect(entry.getByTestId('entry-entry')).toContainText(
      'generate: false',
    );
    await expect(admin.getByRole('button', { name: 'Create' })).toBeVisible();
  });

  test('Create names the repository, its scaffold commit and the pull request as the person, follows the phases to readiness and marks the repository ready only then', async ({
    admin,
  }) => {
    const isCreatePath = (url: URL) =>
      url.pathname.endsWith('/repositories/repositories');
    const isRecord = (url: URL) =>
      url.pathname.endsWith(`/repositories/repositories/${NAME}`);
    const isWatch = (url: URL) =>
      url.pathname.endsWith(`/repositories/repositories/${NAME}/watch`);
    // The list shares the create path, so the method decides inside the
    // handler; the same references are unrouted below -- a fresh closure
    // would leave the stub on the page for the cases that follow.
    const stubbed = (url: URL) =>
      isCreatePath(url) || isRecord(url) || isWatch(url);
    const watches: unknown[] = [];
    // The follow answers "the pull request is open" until the test has seen
    // that state; the page calls again on its own and finds every phase done.
    let phasesDone = false;
    const stub = (route: Route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.method() === 'POST' && isCreatePath(url)) {
        return route.fulfill({ json: created });
      }
      if (isWatch(url)) {
        watches.push(request.postDataJSON());
        return route.fulfill({ json: phasesDone ? ready : watching });
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

      // The three artefacts in the order the manager wrote them; the
      // repository is its name while the set-up runs.
      const result = admin.getByTestId('repository-created');
      await expect(result).toBeVisible();
      await expect(admin.getByText('Created as admin')).toBeVisible();
      await expect(result.getByTestId('repository-name')).toHaveText(
        `giantswarm/${NAME}`,
      );
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

      // The follow: the phases as the manager answered them, with the time
      // since the creation, the pending one with what it waits for; then,
      // on the next call, every phase done -- the release linked, the
      // repository marked ready, the record's steps beneath.
      const live = admin.getByTestId('live-setup');
      const phases = live.getByTestId('phases');
      await expect(phases.getByTestId('phase-declared')).toContainText(
        'Declared after 13 s (+9 s)',
      );
      await expect(phases.getByTestId('phase-merged')).toContainText(
        'the declaration pull request has not merged yet',
      );
      await expect(phases.getByTestId('phase-released')).toHaveAttribute(
        'data-state',
        'ahead',
      );
      expect(watches[0]).toEqual({ pullRequest: 4242, timeout: 20 });
      phasesDone = true;
      await expect(live.getByTestId('setup-ready')).toBeVisible({
        timeout: 30_000,
      });
      expect(watches.length).toBeGreaterThanOrEqual(2);
      await expect(phases.getByTestId('phase-released')).toContainText(
        'Released after 4 min 10 s (+1 min 41 s) v0.1.0',
      );
      await expect(
        phases.getByRole('link', { name: /v0\.1\.0/ }),
      ).toHaveAttribute('href', ready.release.url);
      await expect(
        result.getByRole('link', { name: `giantswarm/${NAME}` }),
      ).toHaveAttribute('href', `https://github.com/giantswarm/${NAME}`);
      await expect(result).toContainText('ready');
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

  test('an undeclared repository offers Adopt, Deprecate, Archive and Align now, none disabled, and says no team file declares it; Adopt opens the Create form on what GitHub knows and writes nothing on Cancel', async ({
    admin,
  }) => {
    const { name, record } = await expandUndeclared(admin);
    for (const action of ['Adopt', 'Deprecate', 'Archive', 'Align now']) {
      await expect(record.getByRole('button', { name: action })).toBeEnabled();
    }
    for (const action of ['Edit', 'Transfer', 'Delete']) {
      await expect(record.getByRole('button', { name: action })).toHaveCount(0);
    }
    await expect(record.getByTestId('undeclared-note')).toContainText(
      `No team file declares giantswarm/${name}.`,
    );

    await record.getByRole('button', { name: 'Adopt' }).click();
    const dialog = admin.getByRole('form', {
      name: new RegExp(`^Adopt ${name}`),
    });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(
      `giantswarm/${name} exists on GitHub and no team file declares it.`,
    );
    // The Create form: the team a choice that opens on the person's own,
    // the name the repository's (no name field), the description, the
    // preset question, the declaration with the generator off, the opt-in
    // unchecked, the reason.
    await expect(dialog.getByRole('button', { name: /Team$/ })).toContainText(
      /team-/,
      { timeout: 60_000 },
    );
    await expect(dialog.getByTestId('adopted-repository')).toContainText(
      `giantswarm/${name}`,
    );
    await expect(dialog.getByRole('textbox', { name: /^Name/ })).toHaveCount(0);
    await expect(dialog.getByLabel(/^Description/)).toBeVisible();
    await expect(
      dialog.getByRole('radiogroup', { name: 'What is it?' }),
    ).toBeVisible();
    await expect(dialog.getByTestId('declaration-summary')).toContainText(
      'CircleCI config not generated',
    );
    await expect(
      dialog.getByRole('checkbox', { name: 'Opted in to alignment' }),
    ).not.toBeChecked();
    await expect(dialog.getByLabel(/^Reason/)).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Review' })).toBeEnabled();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();

    // Archive on the same row: the team and the reason only, the lifecycle named.
    await record.getByRole('button', { name: 'Archive' }).click();
    const archive = admin.getByRole('form', {
      name: new RegExp(`^Archive ${name}`),
    });
    await expect(archive).toBeVisible();
    await expect(archive).toContainText(
      'declares it for the team chosen below and sets lifecycle: archived',
    );
    await expect(archive.getByTestId('declaration-summary')).toHaveCount(0);
    await expect(archive.getByLabel(/^Reason/)).toBeVisible();
    await archive.getByRole('button', { name: 'Cancel' }).click();
    await expect(archive).toBeHidden();
  });

  test('Archive names what it does and the team review it asks for, and writes nothing on Cancel', async ({
    admin,
  }) => {
    const { name, record } = await expandDeclared(admin);
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

  test('Edit opens on the entry as the Create form shows it -- the team and the name fixed, the preset, the declaration, the opt-in, the reason -- and writes nothing on Cancel', async ({
    admin,
  }) => {
    const { name, record } = await expandDeclared(admin);
    await expect(record.getByRole('button', { name: 'Configure' })).toHaveCount(
      0,
    );
    await record.getByRole('button', { name: 'Edit' }).click();
    const dialog = admin.getByRole('form', {
      name: new RegExp(`^Edit ${name}`),
    });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(
      'the fields as Create repository asks them',
    );
    // The entry's repository, team and file are fixed: no team choice, no
    // name field.
    const existing = dialog.getByTestId('existing-entry');
    await expect(existing).toContainText(`giantswarm/${name}`);
    await expect(existing).toContainText(
      /Declared by team-\S+ in repositories\/team-\S+\.yaml/,
    );
    await expect(dialog.getByLabel(/^Name/)).toHaveCount(0);
    // The Create form's sections: the preset question, the declaration line,
    // the opt-in to alignment, the reason.
    await expect(
      dialog.getByRole('radiogroup', { name: 'What is it?' }),
    ).toBeVisible();
    await expect(dialog.getByTestId('declaration-summary')).toContainText(
      'CircleCI config',
    );
    await expect(
      dialog.getByRole('checkbox', { name: 'Opted in to alignment' }),
    ).toBeVisible();
    await expect(dialog.getByLabel(/^Reason/)).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Review' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
  });

  test('Transfer names who gives and who takes; the receiving team is a choice of the teams without the giving one, and Cancel writes nothing', async ({
    admin,
  }) => {
    const { name, record } = await expandDeclared(admin);
    await record.getByRole('button', { name: 'Transfer' }).click();
    const dialog = admin.getByRole('form', {
      name: new RegExp(`^Transfer ${name}`),
    });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(
      /team-\S+ gives giantswarm\/\S+; the team chosen below takes it\./,
    );
    await expect(dialog).toContainText(
      "receiving team's channel and its member approves",
    );
    const [, giving] =
      /(team-\S+) gives giantswarm\//.exec(await dialog.innerText()) ?? [];
    expect(giving).toBeTruthy();

    // The receiving team is a choice, not typed: the teams the manager
    // knows -- the person's own first, labelled -- less the giving team.
    const receiving = dialog.getByRole('button', { name: /Receiving team$/ });
    await expect(receiving).toHaveText(/Pick the receiving team/, {
      timeout: 60_000,
    });
    await expect(
      dialog.getByRole('textbox', { name: /^Receiving team/ }),
    ).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Review' })).toBeDisabled();
    await receiving.click();
    const options = admin.getByRole('option');
    await expect(options.first()).toBeVisible();
    const labels = await options.allInnerTexts();
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      expect(label).toMatch(/^team-/);
      expect(label.split(/\s/)[0]).not.toBe(giving);
    }
    await options.first().click();
    await expect(receiving).toContainText(labels[0].split(/\s/)[0]);
    await expect(dialog.getByRole('button', { name: 'Review' })).toBeEnabled();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
  });

  test('Delete stands apart in another colour, names what it does, needs the repository name typed, and writes nothing on Cancel', async ({
    admin,
  }) => {
    const { name, record } = await expandDeclared(admin);
    const del = record.getByRole('button', { name: 'Delete' });
    await expect(del).toBeEnabled();
    // Apart from the group of the other actions, and not in their colour.
    expect(await del.evaluate(el => el.closest('[role="group"]'))).toBeNull();
    const [deleteColor, archiveColor] = await Promise.all([
      del.evaluate(el => getComputedStyle(el).color),
      record
        .getByRole('button', { name: 'Archive' })
        .evaluate(el => getComputedStyle(el).color),
    ]);
    expect(deleteColor).not.toBe(archiveColor);

    await del.click();
    const dialog = admin.getByRole('form', {
      name: new RegExp(`^Delete ${name}`),
    });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(
      'unfollows the repository on CircleCI and deletes it on GitHub',
    );
    await expect(dialog).toContainText('record of the deletion');
    const review = dialog.getByRole('button', { name: 'Review' });
    await expect(review).toBeDisabled();
    await dialog.getByLabel(/^Repository name/).fill(name);
    await expect(review).toBeEnabled();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
  });

  /**
   * `align_repository`'s answer in the manager's shape (0.22.0 and later),
   * per mode: opted in (`align`), declared but not opted in (`opt-in`), a
   * check. The lab's manager refuses the dry run -- it reads the team file in
   * giantswarm/github as the person, and the lab's GitHub stand-in has none
   * -- so the align route is stubbed at the browser like the create commit;
   * the dialog's behaviour per mode is pinned all the same.
   */
  const alignmentOf = (
    name: string,
    mode: 'align' | 'opt-in' | 'check',
    committed: boolean,
  ) => {
    const title = `chore(repositories): opt ${name} in to alignment (team-bumblebee)`;
    return {
      workflow: 'reconcile-repositories.yaml',
      inputs: { repository: name, team: 'team-bumblebee' },
      as: 'admin',
      dispatched: committed && mode !== 'opt-in',
      runsUrl:
        'https://github.com/giantswarm/github/actions/workflows/reconcile-repositories.yaml',
      then: "the completion message follows in team-bumblebee's channel",
      team: 'team-bumblebee',
      optedIn: mode === 'align',
      mode,
      planned: [
        {
          step: 'protection',
          changes: ['main: enforce for administrators', 'main: strict checks'],
        },
        { step: 'circleci', changes: ['follow the project'] },
      ],
      checkedAt: '2026-09-18T18:28:49Z',
      warning:
        "Aligning changes the repository's settings, permissions, branch protection and CircleCI project on GitHub and CircleCI to its declared set-up and the company baseline.",
      ...(mode === 'opt-in' && {
        optIn: {
          plan: {
            repository: `giantswarm/${name}`,
            team: 'team-bumblebee',
            accepted: true,
            before: `- name: ${name}\n  componentType: service\n`,
            entry: `- name: ${name}\n  componentType: service\n  align: true\n`,
            pullRequest: {
              repository: 'giantswarm/github',
              branch: `reposetup/align-${name}`,
              title,
              files: ['repositories/team-bumblebee.yaml'],
              body: '## Problem\n\n…',
              as: 'admin',
            },
            ask: {
              team: 'team-bumblebee',
              channel: '#team-bumblebee',
              text: `admin asks to align giantswarm/${name}`,
              deliverable: true,
            },
          },
          committed: committed
            ? {
                pullRequest: {
                  number: 4244,
                  url: 'https://github.com/giantswarm/github/pull/4244',
                  branch: `reposetup/align-${name}`,
                  title,
                  author: 'admin',
                },
                ask: {
                  team: 'team-bumblebee',
                  channel: '#team-bumblebee',
                  delivered: true,
                  reviewId: 'rev-1',
                },
              }
            : undefined,
        },
      }),
    };
  };

  test('Align now is one dialog: the dry run as it opens, one sentence per mode with the intranet link, the planned changes; Cancel writes nothing, Opt in and align shows the pull request', async ({
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

    // The align route, stubbed: the mode is the test's, the answer follows
    // the request (dry run or commit).
    let mode: 'align' | 'opt-in' = 'opt-in';
    const isAlign = (url: URL) =>
      decodeURIComponent(url.pathname).endsWith(
        `/repositories/repositories/giantswarm/${name}/align`,
      );
    const stub = (route: Route) => {
      const body = route.request().postDataJSON() as { mode?: string };
      return route.fulfill({
        json: alignmentOf(name, mode, body.mode === 'commit'),
      });
    };
    const dialog = admin.getByRole('form', {
      name: new RegExp(`^Align ${name} now`),
    });
    const intranet =
      /^https:\/\/intranet\.giantswarm\.io\/docs\/dev-and-releng\/repository-setup\/$/;
    await admin.route(isAlign, stub);
    try {
      // A declared repository has nothing to fill in: the dry run starts as
      // the dialog opens -- no Review step -- and the dialog says in one
      // sentence what the commit does, links the intranet page for the rest
      // and lists the changes the last check planned. The manager's
      // paragraph, the opt-in plan and the dispatch preview are gone.
      for (mode of ['opt-in', 'align'] as const) {
        await record.getByRole('button', { name: 'Align now' }).click();
        await expect(dialog).toBeVisible();
        await expect(
          dialog.getByRole('button', { name: 'Review' }),
        ).toHaveCount(0);
        const alignment = dialog.getByTestId('alignment');
        await expect(alignment).toBeVisible({ timeout: 60_000 });
        const lead = alignment.getByTestId('lead');
        await expect(lead).toContainText(
          mode === 'align'
            ? `Applies the declared set-up and the company baseline to giantswarm/${name} on GitHub and CircleCI, as you.`
            : `giantswarm/${name} has not opted in to alignment. Opt in and align opens a pull request as you that sets align: true in its entry; a member of team-bumblebee approves it and the reconciler applies the changes below when it merges.`,
        );
        await expect(
          lead.getByRole('link', { name: /How alignment works/ }),
        ).toHaveAttribute('href', intranet);
        const planned = alignment.getByTestId('planned');
        await expect(planned).toContainText(
          /^Planned changes · checked .+ ago/,
        );
        await expect(planned).toContainText('main: enforce for administrators');
        await expect(planned).toContainText('follow the project');
        await expect(alignment.getByTestId('alignment-warning')).toHaveCount(0);
        await expect(alignment.getByTestId('dispatch')).toHaveCount(0);
        await expect(alignment.getByTestId('plan')).toHaveCount(0);
        await expect(dialog).not.toContainText('Would dispatch');
        // The confirm label follows the mode.
        await expect(
          dialog.getByRole('button', {
            name: mode === 'align' ? 'Align now' : 'Opt in and align',
          }),
        ).toBeVisible();
        await dialog.getByRole('button', { name: 'Cancel' }).click();
        await expect(dialog).toBeHidden();
      }

      // Opt in and align: the pull request opened as the person with its ask
      // delivered, one line on what follows, nothing dispatched.
      mode = 'opt-in';
      await record.getByRole('button', { name: 'Align now' }).click();
      await expect(dialog.getByTestId('alignment')).toBeVisible({
        timeout: 60_000,
      });
      await dialog.getByRole('button', { name: 'Opt in and align' }).click();
      const opened = dialog.getByTestId('pull-request-opened');
      await expect(opened).toBeVisible({ timeout: 30_000 });
      await expect(opened).toContainText(
        `#4244 chore(repositories): opt ${name} in to alignment (team-bumblebee)`,
      );
      await expect(opened).toContainText(
        'The ask posted to #team-bumblebee (team-bumblebee).',
      );
      await expect(
        opened.getByRole('link', { name: /Open the pull request/ }),
      ).toHaveAttribute(
        'href',
        'https://github.com/giantswarm/github/pull/4244',
      );
      await expect(dialog.getByTestId('then')).toContainText(
        `When it merges, the reconciler aligns giantswarm/${name}`,
      );
      await expect(dialog.getByTestId('dispatch')).toHaveCount(0);
      await expect(dialog.getByTestId('planned')).toHaveCount(0);
      await dialog
        .getByRole('button', { name: 'Close' })
        .filter({ hasText: 'Close' })
        .click();
      await expect(dialog).toBeHidden();
    } finally {
      await admin.unroute(isAlign, stub);
    }
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
