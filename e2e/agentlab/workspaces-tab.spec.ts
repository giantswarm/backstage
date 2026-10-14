import type { Page } from '@playwright/test';
import { open } from './fixtures';
import { lab } from './lab';
import {
  expect,
  NON_MEMBER,
  PUBLIC_REPOSITORIES,
  PUBLIC_SOURCE,
  test,
} from './workspaces.fixture';

/**
 * Customize · Workspaces in the agent shell: the workspaces of the person's
 * Organization, read through the portal's muster as the person, on the
 * workspace fixtures (`workspaces.fixture.ts`).
 */

/** Full-page screenshots when `AGENTLAB_E2E_SCREENSHOTS=<dir>` is set — the PR's evidence. */
async function snapshot(page: Page, name: string): Promise<void> {
  const dir = process.env.AGENTLAB_E2E_SCREENSHOTS;
  if (dir) {
    await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
  }
}

const rowOf = (page: Page, name: string) =>
  page.getByRole('row').filter({
    has: page.getByRole('rowheader', { name: new RegExp(`^${name}`) }),
  });

test('a member sees the fixture workspace with its repositories, last sync and Sessions', async ({
  admin,
  labWorkspace,
}) => {
  await open(admin, '/customize/workspaces');
  await expect(
    admin.getByRole('main').getByRole('tab', { name: /^Workspaces/ }),
  ).toHaveAttribute('aria-selected', 'true');

  const row = rowOf(admin, labWorkspace.name);
  await expect(row, 'the fixture workspace is listed').toBeVisible({
    timeout: 60_000,
  });
  const cells = row.getByRole('gridcell');
  await expect(
    cells.filter({
      hasText: `${PUBLIC_SOURCE.provider}: ${PUBLIC_SOURCE.owner}`,
    }),
  ).toHaveCount(1);
  await expect(
    cells.filter({ hasText: new RegExp(`^${PUBLIC_REPOSITORIES.length}$`) }),
    'the repository count of the first sync',
  ).not.toHaveCount(0);
  await expect(
    row.getByText(/^(Synced|No change|Sync requested|Syncing)$/),
    'the last sync and its result',
  ).toBeVisible();
  await snapshot(admin, 'workspaces-tab');
  // When it happened sits behind the state's info icon: a press opens it.
  const hint = `About the state of ${labWorkspace.name}`;
  await row.getByRole('button', { name: hint, exact: true }).click();
  await expect(
    admin.getByRole('dialog', { name: hint, exact: true }),
    'the last sync, relative, behind the info icon',
  ).toContainText(/ ago\./);
  await admin.keyboard.press('Escape');
  // The Sessions column: the fixture workspace has none.
  await expect(cells.filter({ hasText: /^0$/ })).not.toHaveCount(0);
});

test('a person outside the Organization does not see its workspace', async ({
  admin,
  labWorkspace,
  workspaceLab,
}) => {
  // Listed for the member, so the absence below is the membership's.
  await open(admin, '/customize/workspaces');
  await expect(rowOf(admin, labWorkspace.name)).toBeVisible({
    timeout: 60_000,
  });

  const outsider = (await workspaceLab.tools(NON_MEMBER)).page;
  await open(outsider, '/customize/workspaces', NON_MEMBER);
  // Settled: the tab's answer for them, or no tab at all.
  await expect(
    outsider
      .getByText('No Organization to show workspaces of')
      .or(outsider.getByRole('table'))
      .or(outsider.getByText(/^No workspaces in /))
      .or(outsider.getByRole('main').getByRole('tab', { name: /^Agents/ }))
      .first(),
  ).toBeVisible({ timeout: 60_000 });
  await expect(rowOf(outsider, labWorkspace.name)).toHaveCount(0);
  await expect(
    outsider.getByRole('option', { name: lab.workspaces.organization }),
  ).toHaveCount(0);
});

test('delete asks first, names the workspace, and removes it', async ({
  admin,
  workspaceLab,
}) => {
  test.skip(!!workspaceLab.unavailable, workspaceLab.unavailable);
  test.setTimeout(10 * 60_000);
  const doomed = await workspaceLab.create(
    'tab-delete',
    [PUBLIC_SOURCE],
    PUBLIC_REPOSITORIES,
  );

  await open(admin, '/customize/workspaces');
  const row = rowOf(admin, doomed.name);
  await expect(row).toBeVisible({ timeout: 60_000 });
  await row.getByRole('button', { name: `Actions for ${doomed.name}` }).click();
  await admin.getByRole('menuitem', { name: 'Delete…' }).click();

  // By name: the row menu's popover is a dialog too while it closes.
  const dialog = admin.getByRole('dialog', { name: `Delete ${doomed.name}?` });
  await expect(dialog.getByText(`Delete ${doomed.name}?`)).toBeVisible();
  await expect(
    dialog.getByText('Its sync stops and no new Session can start on it.'),
  ).toBeVisible();
  await expect(
    dialog.getByText(/its volume goes with it/i),
    'no Session uses the new workspace',
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete workspace' }).click();
  await expect(dialog).toBeHidden();

  await expect(
    rowOf(admin, doomed.name),
    'the deleted workspace leaves the list once its volume is gone',
  ).toHaveCount(0, { timeout: 3 * 60_000 });
});
