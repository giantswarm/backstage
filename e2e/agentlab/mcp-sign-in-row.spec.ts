import type { Locator, Page } from '@playwright/test';
import {
  completeDexLogin,
  connectToMuster,
  expect,
  open,
  test,
} from './fixtures';
import { lab } from './lab';

/**
 * The Notification inbox's MCP sign-in row, and muster's sign-in dialog it
 * opens, on the lab's `lab-oauth-fixture`: an OAuth-protected server whose
 * authorization server is muster itself, so the sign-in through the dialog
 * runs the real challenge chain (proxy start → muster → Dex).
 */

const FIXTURE = 'lab-oauth-fixture';
const fixturePath = `/customize/connectors/${lab.installation}/${FIXTURE}`;

/**
 * Leaves the fixture signed out for the admin, as the lab ships it: from its
 * connector page, as a person does (`mcp-servers.spec.ts` does the same).
 */
async function signOutOfFixture(page: Page) {
  await open(page, fixturePath);
  await connectToMuster(
    page,
    page.getByRole('heading', { level: 1, name: FIXTURE }),
  );
  await page.getByRole('tab', { name: /^Tools/ }).click();
  const signIn = page.getByRole('button', { name: 'Sign in' }).first();
  await expect(
    signIn.or(page.getByRole('tab', { name: /^Tools \([1-9]/ })).first(),
    'the fixture offers Sign in, or its tools once signed in',
  ).toBeVisible({ timeout: 120_000 });
  if (await signIn.isVisible()) {
    return;
  }
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(signIn).toBeVisible({ timeout: 60_000 });
}

/** Opens the bell's overlay on the rail's Profile row. */
async function openInbox(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: /^Notifications/ }).click();
  const overlay = page.getByRole('dialog', { name: 'Notifications' });
  await expect(overlay).toBeVisible();
  return overlay;
}

/** The overlay's MCP sign-in row that names the fixture. */
function fixtureRow(overlay: Locator): Locator {
  return overlay
    .getByRole('listitem')
    .filter({ hasText: /MCP servers? needs? your sign-in/ })
    .filter({ hasText: FIXTURE });
}

test('the inbox names a server waiting for the sign-in, and its Sign in signs in to it', async ({
  admin,
}) => {
  test.setTimeout(240_000);
  await signOutOfFixture(admin);

  // A page with nothing to do with MCP servers: the row is shell-wide.
  await open(admin, '/sessions');
  const overlay = await openInbox(admin);
  const row = fixtureRow(overlay);
  await expect(row, 'the row names the fixture').toBeVisible({
    timeout: 60_000,
  });

  await row.getByRole('button', { name: 'Sign in to MCP servers' }).click();
  await expect(overlay, 'Sign in closes the overlay').toBeHidden();
  await expect(admin, 'the page stays where it was').toHaveURL(/\/sessions$/);
  const dialog = admin.getByRole('dialog', { name: 'Sign in to MCP servers' });
  await expect(dialog).toBeVisible();
  const server = dialog.getByRole('listitem').filter({ hasText: FIXTURE });
  await expect(server).toBeVisible();

  const popup = admin.waitForEvent('popup');
  await server.getByRole('button', { name: 'Sign in' }).click();
  await completeDexLogin(await popup, lab.users.admin);

  await expect(
    server,
    'the server turns Connected without a reload',
  ).toContainText('Connected', { timeout: 60_000 });
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(
    fixtureRow(await openInbox(admin)),
    'the fixture no longer waits',
  ).toHaveCount(0);

  await signOutOfFixture(admin);
});

test('marking the row read puts it aside on every page, and it stays in the overlay', async ({
  admin,
}) => {
  test.setTimeout(180_000);
  await signOutOfFixture(admin);

  await open(admin, '/sessions');
  const overlay = await openInbox(admin);
  const row = fixtureRow(overlay);
  await expect(row).toBeVisible({ timeout: 60_000 });
  await overlay.getByRole('button', { name: 'Mark all read' }).click();
  await expect(row, 'the row is read').not.toHaveAttribute(
    'data-unread',
    'true',
  );
  await expect(
    admin.getByRole('button', { name: 'Notifications', exact: true }),
    'the bell counts nothing',
  ).toBeVisible();

  // Another page: still read, and still there while the fixture waits.
  await open(admin, '/customize/agents');
  await expect(
    admin.getByRole('button', { name: 'Notifications', exact: true }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(fixtureRow(await openInbox(admin))).toBeVisible();
});
