import type { Page } from '@playwright/test';
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
 * The portal-wide notice that MCP servers wait for the person's own sign-in,
 * and its dialog, on the lab's `lab-oauth-fixture`: an OAuth-protected server
 * whose authorization server is muster itself, so the sign-in through the
 * dialog runs the real challenge chain (proxy start → muster → Dex).
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

test('every page names a server waiting for the sign-in, and its dialog signs in to it', async ({
  admin,
}) => {
  test.setTimeout(240_000);
  await signOutOfFixture(admin);

  // A page with nothing to do with MCP servers: the notice is portal-wide.
  await open(admin, '/catalog');
  const notice = admin.getByRole('complementary', {
    name: 'MCP server sign-in',
  });
  await expect(notice, 'the notice names the fixture').toContainText(FIXTURE, {
    timeout: 60_000,
  });
  await expect(notice).toContainText(/MCP servers? needs? your sign-in/);

  await notice.getByRole('button', { name: 'Sign in' }).click();
  const dialog = admin.getByRole('dialog', { name: 'Sign in to MCP servers' });
  await expect(dialog).toBeVisible();
  const row = dialog.getByRole('listitem').filter({ hasText: FIXTURE });
  await expect(row).toBeVisible();

  const popup = admin.waitForEvent('popup');
  await row.getByRole('button', { name: 'Sign in' }).click();
  await completeDexLogin(await popup, lab.users.admin);

  await expect(row, 'the row turns Connected without a reload').toContainText(
    'Connected',
    { timeout: 60_000 },
  );
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(
    notice.filter({ hasText: FIXTURE }),
    'the fixture no longer waits',
  ).toHaveCount(0);

  await signOutOfFixture(admin);
});

test('Not now hides the notice for the servers it named', async ({ admin }) => {
  test.setTimeout(180_000);
  await signOutOfFixture(admin);

  await open(admin, '/catalog');
  const notice = admin.getByRole('complementary', {
    name: 'MCP server sign-in',
  });
  await expect(notice).toContainText(FIXTURE, { timeout: 60_000 });
  await notice.getByRole('button', { name: 'Not now' }).click();
  await expect(notice).toHaveCount(0);

  // Another page of the same browser session: still hidden.
  await open(admin, '/customize/agents');
  await expect(admin.getByText('Agents').first()).toBeVisible();
  await expect(notice).toHaveCount(0);
});

test('the notice stands clear of the wizard footer: Continue takes the click while it shows', async ({
  admin,
}) => {
  test.setTimeout(240_000);
  await admin.setViewportSize({ width: 1440, height: 900 });
  await signOutOfFixture(admin);

  await open(admin, '/customize/agents/new');
  // The worker keeps one page: a Not now earlier in the run hid the notice
  // for this browser session.
  await admin.evaluate(() =>
    window.sessionStorage.removeItem('muster.mcpAuthNotice.hidden'),
  );
  await open(admin, '/customize/agents/new');
  const notice = admin.getByRole('complementary', {
    name: 'MCP server sign-in',
  });
  await expect(notice).toContainText(FIXTURE, { timeout: 60_000 });

  await fillAgentDetails(admin, {
    name: 'Notice clearance probe',
    description: 'Never created: the run only steps through the wizard.',
    instructions: 'You are a probe.',
  });

  // The wizard's footer: inside the shell's <main>, so no contentinfo landmark.
  const footer = admin
    .locator('footer')
    .filter({ has: admin.getByRole('button', { name: 'Continue' }) });
  const noticeBox = await notice.boundingBox();
  const footerBox = await footer.boundingBox();
  expect(
    noticeBox!.y + noticeBox!.height,
    'the notice ends above the wizard footer',
  ).toBeLessThanOrEqual(footerBox!.y + 0.5);

  // Not forced: Playwright's own actionability check fails a click that
  // another element (the notice) would receive.
  await footer.getByRole('button', { name: 'Continue' }).click();
  await expectWizardStep(admin, 'Skills');
  await expect(notice, 'the notice is still shown').toBeVisible();
  await footer.getByRole('button', { name: 'Continue' }).click();
  await expectWizardStep(admin, 'Tools');
});
