import type { Page } from '@playwright/test';
import { expect, open, signIn, test } from './fixtures';
import { contextOptionsFor, lab } from './lab';

/**
 * A workspace's page (`/customize/workspaces/<installation>/<organization>/<name>`)
 * on a workspace the lab already holds: the suite has no workspace fixture,
 * since a workspace reads a real GitHub owner with the person's own grant of
 * the lab's GitHub App, which only a person's browser sign-in gives. Name one
 * with `AGENTLAB_WORKSPACE=<organization>/<name>`, created by the admin in the
 * portal with at least one Session started on it; without it the spec skips.
 */
const [organization, name] = (process.env.AGENTLAB_WORKSPACE ?? '').split('/');
const path = `/customize/workspaces/${lab.installation}/${organization}/${name}`;

test.skip(
  !organization || !name,
  'AGENTLAB_WORKSPACE=<organization>/<name> names no workspace of the lab',
);

/** Whether muster still waits for the person's sign-in to workspace-manager. */
async function needsManagerSignIn(page: Page): Promise<boolean> {
  const card = page.getByTestId('workspaces-sign-in');
  // The heading shows above the sign-in card too: wait for what only a read
  // page or a refusal shows.
  const main = page.getByRole('main');
  const read = main
    .getByText(/^Organization .+ · /)
    .or(main.getByText(/^You are not a member of /));
  await expect(card.or(read).first()).toBeVisible();
  return card.isVisible();
}

test('shows the workspace, its repositories with head commits and its Sessions with cleanup dates', async ({
  admin,
}) => {
  await open(admin, path);
  test.skip(
    await needsManagerSignIn(admin),
    'the admin has not signed in to workspace-manager in muster (the GitHub App grant)',
  );

  const main = admin.getByRole('main');
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

  await main.getByRole('tab', { name: /^Sessions/ }).click();
  await expect(admin).toHaveURL(new RegExp(`${path}/sessions$`));
  const sessions = main.locator('table');
  await expect(sessions.getByRole('row').nth(1)).toContainText(/\d{4}/);
  await expect(sessions.getByRole('link').first()).toHaveAttribute(
    'href',
    new RegExp(`/sessions/${lab.installation}/`),
  );

  await main.getByRole('tab', { name: /^Details/ }).click();
  await expect(
    main.getByRole('region', { name: 'Synchronization status' }),
  ).toBeVisible();
  await expect(main.getByRole('region', { name: 'Disk' })).toContainText(
    'Capacity',
  );
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

  const main = admin.getByRole('main');
  await main.getByRole('button', { name: 'Synchronize' }).click();
  await expect(
    main.getByRole('button', { name: 'Synchronizing…' }),
  ).toBeDisabled();
  // The outcome is a notification: success, unchanged or with what was
  // fetched, or the failure with the manager's reason.
  await expect(
    admin
      .getByText(
        /^Workspace synchronization successful$|^Synchronization of .* failed$/,
      )
      .first(),
  ).toBeVisible({ timeout: 4 * 60_000 });
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
