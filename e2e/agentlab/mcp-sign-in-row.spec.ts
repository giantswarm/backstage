import type { Locator, Page } from '@playwright/test';
import {
  completeDexLogin,
  connectToMuster,
  expect,
  expectWizardStep,
  fillAgentDetails,
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
 * Resolves what the portal calls it (the page's title): the row and the
 * dialog name it so, its display name if it has one.
 */
async function signOutOfFixture(page: Page): Promise<string> {
  await open(page, fixturePath);
  const heading = page.getByRole('heading', { level: 1 });
  await connectToMuster(page, heading);
  const label = (await heading.innerText()).trim();
  await page.getByRole('tab', { name: /^Tools/ }).click();
  const signIn = page.getByRole('button', { name: 'Sign in' }).first();
  await expect(
    signIn.or(page.getByRole('tab', { name: /^Tools \([1-9]/ })).first(),
    'the fixture offers Sign in, or its tools once signed in',
  ).toBeVisible({ timeout: 120_000 });
  if (!(await signIn.isVisible())) {
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(signIn).toBeVisible({ timeout: 60_000 });
  }
  return label;
}

/** Opens the bell's overlay on the rail's Profile row. */
async function openInbox(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: /^Notifications/ }).click();
  const overlay = page.getByRole('dialog', { name: 'Notifications' });
  await expect(overlay).toBeVisible();
  return overlay;
}

/** The overlay's MCP sign-in row, naming the fixture by `label`. */
function fixtureRow(overlay: Locator, label: string): Locator {
  return overlay
    .getByRole('listitem')
    .filter({ hasText: /MCP servers? needs? your sign-in/ })
    .filter({ hasText: label });
}

test('the inbox names a server waiting for the sign-in, and its Sign in signs in to it', async ({
  admin,
}) => {
  test.setTimeout(240_000);
  const label = await signOutOfFixture(admin);

  // A page with nothing to do with MCP servers: the row is shell-wide.
  await open(admin, '/sessions');
  const overlay = await openInbox(admin);
  const row = fixtureRow(overlay, label);
  await expect(row, 'the row names the fixture').toBeVisible({
    timeout: 60_000,
  });

  await row.getByRole('button', { name: 'Sign in to MCP servers' }).click();
  await expect(overlay, 'Sign in closes the overlay').toBeHidden();
  await expect(admin, 'the page stays where it was').toHaveURL(/\/sessions$/);
  const dialog = admin.getByRole('dialog', { name: 'Sign in to MCP servers' });
  await expect(dialog).toBeVisible();
  const server = dialog.getByRole('listitem').filter({ hasText: label });
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
    fixtureRow(await openInbox(admin), label),
    'the fixture no longer waits',
  ).toHaveCount(0);

  await signOutOfFixture(admin);
});

test('marking the row read puts it aside on every page, and it stays in the overlay', async ({
  admin,
}) => {
  test.setTimeout(180_000);
  const label = await signOutOfFixture(admin);

  await open(admin, '/sessions');
  const overlay = await openInbox(admin);
  const row = fixtureRow(overlay, label);
  await expect(row).toBeVisible({ timeout: 60_000 });
  // Other rows of the shared admin may come and go: only this row is read.
  if ((await row.getAttribute('data-unread')) === 'true') {
    await overlay.getByRole('button', { name: 'Mark all read' }).click();
  }
  await expect(row, 'the row is read').not.toHaveAttribute(
    'data-unread',
    'true',
  );

  // Another page: still read, and still there while the fixture waits.
  await open(admin, '/customize/agents');
  const again = fixtureRow(await openInbox(admin), label);
  await expect(again).toBeVisible({ timeout: 60_000 });
  await expect(again).not.toHaveAttribute('data-unread', 'true');
});

test("the inbox's toasts stand clear of the wizard footer: Continue takes the click while one shows", async ({
  admin,
}) => {
  test.setTimeout(240_000);
  await admin.setViewportSize({ width: 1440, height: 900 });
  await signOutOfFixture(admin);

  // Nothing seen yet, in a fresh tab: the waiting fixture is catch-up, and
  // its summary toast stays until answered.
  await admin.route('**/api/user-settings/**/notificationSeenMarks', route =>
    route.request().method() === 'GET'
      ? route.fulfill({ status: 404 })
      : route.fallback(),
  );
  await admin.evaluate(
    key => window.sessionStorage.removeItem(key),
    'agentPlatform.notificationInbox.tab',
  );
  await open(admin, '/customize/agents/new');
  const toast = admin
    .getByRole('alertdialog')
    .filter({ hasText: /needs? your attention/ });
  await expect(toast).toBeVisible({ timeout: 60_000 });

  await fillAgentDetails(admin, {
    name: 'Toast clearance probe',
    description: 'Never created: the run only steps through the wizard.',
    instructions: 'You are a probe.',
  });

  // The wizard's footer: inside the shell's <main>, so no contentinfo landmark.
  const footer = admin
    .locator('footer')
    .filter({ has: admin.getByRole('button', { name: 'Continue' }) });
  const toastBox = await toast.boundingBox();
  const footerBox = await footer.boundingBox();
  expect(
    toastBox!.y + toastBox!.height,
    'the toast ends above the wizard footer',
  ).toBeLessThanOrEqual(footerBox!.y + 0.5);

  // Not forced: Playwright's own actionability check fails a click that
  // another element (the toast) would receive.
  await footer.getByRole('button', { name: 'Continue' }).click();
  await expectWizardStep(admin, 'Skills');
});
