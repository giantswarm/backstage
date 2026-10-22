import type { Page } from '@playwright/test';
import {
  deleteCurrentSession,
  expect,
  open,
  openReadyAgent,
  signIn,
  startSessionButton,
  test,
  type LabAgent,
} from './fixtures';
import { contextOptionsFor, lab } from './lab';

/**
 * A workspace's page (`/customize/workspaces/<installation>/<organization>/<name>`)
 * on a workspace the lab already holds: the suite has no workspace fixture,
 * since a workspace reads a real GitHub owner with the person's own grant of
 * the lab's GitHub App, which only a person's browser sign-in gives. Name one
 * with `AGENTLAB_WORKSPACE=<organization>/<name>`, created by the admin in the
 * portal; without it the spec skips. The Sessions tab's test starts the
 * Session it reads, with the worker's fixture agent, and deletes it.
 */
const [organization, name] = (process.env.AGENTLAB_WORKSPACE ?? '').split('/');
const path = `/customize/workspaces/${lab.installation}/${organization}/${name}`;

test.skip(
  !organization || !name,
  'AGENTLAB_WORKSPACE=<organization>/<name> names no workspace of the lab',
);

/**
 * Whether muster still waits for the person's sign-in to workspace-manager.
 * The GitHub grant is the person's, not the browser's (`grantScope: subject`):
 * a run's fresh muster session adopts it, and the card a first read may show
 * gives way once it has, or once its Sign in reuses the grant without a
 * GitHub page. Only a person with no grant at all keeps the card.
 */
async function needsManagerSignIn(page: Page): Promise<boolean> {
  const card = page.getByTestId('workspaces-sign-in');
  // The heading shows above the sign-in card too: wait for what only a read
  // page or a refusal shows.
  const main = page.getByRole('main');
  const read = main
    .getByText(/^Organization .+ · /)
    .or(main.getByText(/^You are not a member of /));
  await expect(card.or(read).first()).toBeVisible();
  if (!(await card.isVisible())) {
    return false;
  }
  // A sign-in that needs GitHub opens its page in a window of its own, which
  // no headless run completes: the card stays and the spec skips.
  const popups: Page[] = [];
  const keep = (popup: Page) => popups.push(popup);
  page.on('popup', keep);
  try {
    await card.getByRole('button', { name: 'Sign in' }).click();
    await expect(read.first()).toBeVisible({ timeout: 30_000 });
    return false;
  } catch {
    return true;
  } finally {
    page.off('popup', keep);
    await Promise.all(
      popups.map(popup => popup.close().catch(() => undefined)),
    );
  }
}

/**
 * Synchronizes the workspace from its page and waits for the notification of
 * the outcome: success, unchanged or with what was fetched, or the failure
 * with the manager's reason.
 */
async function synchronize(page: Page): Promise<void> {
  const main = page.getByRole('main');
  await main.getByRole('button', { name: 'Synchronize' }).click();
  // The badge says what the button says, from the click on.
  await expect(
    main.getByRole('button', { name: 'Synchronizing…' }),
  ).toBeDisabled();
  await expect(main.getByText('Synchronizing', { exact: true })).toBeVisible();
  await expect(
    page
      .getByText(
        /^Workspace synchronization successful$|^Synchronization of .* failed$/,
      )
      .first(),
  ).toBeVisible({ timeout: 4 * 60_000 });
  await expect(main.getByRole('button', { name: 'Synchronize' })).toBeEnabled();
}

/**
 * Starts a session with `agent` on the workspace from the agent's page — the
 * composer's workspace pick, `authorize_workspace` and `start_session` — and
 * waits for its first turn, which gives its directory a last turn and so a
 * cleanup date. Resolves on the session's page with its id.
 */
async function startSessionOnWorkspace(
  page: Page,
  agent: LabAgent,
): Promise<string> {
  await openReadyAgent(page, agent);
  await startSessionButton(page).click();
  const promptBox = page.getByRole('textbox', { name: 'Prompt' });
  await expect(promptBox).toBeVisible();
  await page.getByRole('button', { name: /Workspace/ }).click();
  await page
    .getByRole('option', { name: new RegExp(`^${name}(\\s|$)`) })
    .click();
  await promptBox.fill('Answer with the word ready.');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  const address = new RegExp(`/sessions/${lab.installation}/([^/]+)$`);
  await expect(page).toHaveURL(address, { timeout: 60_000 });
  await expect(
    page.getByTestId('timeline-agent-message').first(),
    'the first turn finished',
  ).toBeVisible({ timeout: 180_000 });
  return page.url().match(address)![1];
}

/** The page's header and tabs, the Sessions tab listing `session`. */
async function expectWorkspaceTabs(page: Page, session: string): Promise<void> {
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 1, name })).toBeVisible();
  await expect(
    main.getByText(
      new RegExp(`^Organization ${organization} · ${lab.installation} · `),
    ),
  ).toBeVisible();

  // Repositories, the page's own address: the Head cell, the short commit
  // on its own.
  await expect(
    main
      .locator('table')
      .getByRole('row')
      .nth(1)
      .getByText(/^[0-9a-f]{7}$/),
  ).toBeVisible();

  // A Session's directory shows once a sync has measured it.
  await synchronize(page);
  await main.getByRole('tab', { name: /^Sessions/ }).click();
  await expect(page).toHaveURL(new RegExp(`${path}/sessions$`));
  const link = page.locator(
    `a[href$="/sessions/${lab.installation}/${session}"]`,
  );
  const row = main.locator('table').getByRole('row').filter({ has: link });
  await expect(row).toBeVisible();
  // Its cleanup date, from the first turn.
  await expect(row).toContainText(/\d{4}/);

  await main.getByRole('tab', { name: /^Details/ }).click();
  await expect(
    main.getByRole('region', { name: 'Synchronization status' }),
  ).toBeVisible();
  await expect(main.getByRole('region', { name: 'Disk' })).toContainText(
    'Capacity',
  );
}

test('shows the workspace, its repositories with head commits and its Sessions with cleanup dates', async ({
  admin,
  labAgent,
}) => {
  test.setTimeout(15 * 60_000);
  await open(admin, path);
  test.skip(
    await needsManagerSignIn(admin),
    'the admin has not signed in to workspace-manager in muster (the GitHub App grant)',
  );

  const session = await startSessionOnWorkspace(admin, labAgent);
  try {
    await open(admin, path);
    await expectWorkspaceTabs(admin, session);
  } finally {
    await open(admin, `/sessions/${lab.installation}/${session}`);
    await deleteCurrentSession(admin);
  }
});

test('Edit opens the editor on the sign-ins the page already holds', async ({
  admin,
}) => {
  await open(admin, path);
  test.skip(
    await needsManagerSignIn(admin),
    'the admin has not signed in to workspace-manager in muster (the GitHub App grant)',
  );

  const main = admin.getByRole('main');
  await main.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(admin).toHaveURL(new RegExp(`${path}/edit$`));

  // The form, not a second sign-in: the editor reads the workspace's
  // provider instances with the grant the detail page read them with.
  const source = main.getByRole('region', { name: 'Source 1' });
  await expect(source).toBeVisible({ timeout: 30_000 });
  await expect(admin.getByTestId('workspace-editor-gate')).toHaveCount(0);
  await expect(
    source.getByRole('switch', { name: /^Show selected only \(\d+\)$/ }),
  ).toBeVisible();

  // The disk's unit follows the number, outside the editable value.
  await main.getByRole('button', { name: 'Advanced options' }).click();
  const minimum = main.getByRole('textbox', { name: 'Minimum size' });
  await expect(minimum).toBeVisible();
  await expect(minimum).toHaveAccessibleDescription(/this many GiB\./);
  const unit = await minimum.evaluate(input => {
    const after = getComputedStyle(input.parentElement!, '::after');
    return {
      content: after.content,
      paddingRight: getComputedStyle(input).paddingRight,
    };
  });
  expect(unit.content).toBe('"GiB"');
  expect(unit.paddingRight).toBe('44px');
});

test('Synchronize shows the synchronization running and notifies its result when it ends', async ({
  admin,
}) => {
  test.setTimeout(5 * 60_000);
  await open(admin, path);
  test.skip(
    await needsManagerSignIn(admin),
    'the admin has not signed in to workspace-manager in muster (the GitHub App grant)',
  );

  await synchronize(admin);
});

test('the Workspaces tab follows a synchronization without a reload, and says what the page says', async ({
  admin,
}) => {
  test.setTimeout(5 * 60_000);
  await open(admin, path);
  test.skip(
    await needsManagerSignIn(admin),
    'the admin has not signed in to workspace-manager in muster (the GitHub App grant)',
  );
  const main = admin.getByRole('main');
  const settled = /^(Synchronized|Unchanged|Failed)$/;

  await main.getByRole('button', { name: 'Synchronize' }).click();
  await expect(
    main.getByRole('button', { name: 'Synchronizing…' }),
  ).toBeDisabled();
  await expect(main.getByText('Synchronizing', { exact: true })).toBeVisible();

  // To the list in the app, as a person would: no page load reads it afresh.
  await admin.getByRole('link', { name: 'Workspaces', exact: true }).click();
  await expect(admin).toHaveURL(/\/customize\/workspaces(\?|$)/);
  const row = main
    .getByRole('row')
    .filter({ has: admin.getByRole('link', { name, exact: true }) });
  await expect(row.getByText('Synchronizing', { exact: true })).toBeVisible();

  // The list reads again on its own until the synchronization ends.
  const result = row.getByText(settled);
  await expect(result).toBeVisible({ timeout: 4 * 60_000 });
  const label = await result.textContent();

  // Back on the page, in the app: the badge says what the row says.
  await row.getByRole('link', { name, exact: true }).click();
  await expect(main.getByRole('heading', { level: 1, name })).toBeVisible();
  await expect(main.getByText(settled).first()).toHaveText(label!);
  await expect(main.getByRole('button', { name: 'Synchronize' })).toBeEnabled();
});

test('an address naming another Organization goes to the workspace’s own', async ({
  admin,
}) => {
  await open(
    admin,
    `/customize/workspaces/${lab.installation}/e2e-not-${organization}/${name}`,
  );
  test.skip(
    await needsManagerSignIn(admin),
    'the admin has not signed in to workspace-manager in muster (the GitHub App grant)',
  );
  await expect(admin).toHaveURL(new RegExp(`${path}$`));
});

test('an address naming no workspace goes to the Workspaces tab', async ({
  admin,
}) => {
  await open(
    admin,
    `/customize/workspaces/${lab.installation}/${organization}`,
  );
  await expect(admin).toHaveURL(/\/customize\/workspaces$/);
});

test('a person outside the Organization gets a "not a member" page, not the workspace', async ({
  browser,
}) => {
  const context = await browser.newContext(contextOptionsFor('desktop'));
  try {
    const viewer = await context.newPage();
    await signIn(viewer, lab.users.viewer);
    await open(viewer, path, lab.users.viewer);
    test.skip(
      await needsManagerSignIn(viewer),
      'the viewer has not signed in to workspace-manager in muster (the GitHub App grant)',
    );
    const main = viewer.getByRole('main');
    await expect(main.getByText(/^You are not a member of /)).toBeVisible();
    await expect(main.getByRole('button', { name: 'Synchronize' })).toHaveCount(
      0,
    );
    await expect(main.getByRole('tab', { name: /^Repositories/ })).toHaveCount(
      0,
    );
  } finally {
    await context.close();
  }
});
