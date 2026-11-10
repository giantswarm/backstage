import type { Page } from '@playwright/test';
import {
  completeDexLogin,
  expect,
  open,
  openThroughConsent,
  test,
} from './fixtures';
import { fixtureRow, openInbox, signOutOfFixture } from './inboxSignIn';
import { lab } from './lab';

/**
 * New session keeps its unsent prompt and the chosen agent
 * (giantswarm/giantswarm#39043): a connector sign-in from the notification
 * inbox opens the provider in a new tab and leaves the page as it was, and a
 * reload of the page gives the prompt and the agent back. Nothing is started;
 * the fixtures drop the tab's drafts after the test.
 */

const PROMPT = 'Kept across the sign-in; never sent.';

const prompt = (page: Page) => page.getByRole('textbox', { name: 'Prompt' });
/** The keys of the New session drafts the page's tab keeps. */
const storedDrafts = (page: Page) =>
  page.evaluate(() =>
    Object.keys(window.sessionStorage).filter(key =>
      key.startsWith('gs-draft:agent-platform-new-session:'),
    ),
  );
const agentPicker = (page: Page) =>
  page.locator('button[aria-haspopup="listbox"]').first();

test('a sign-in from the inbox and a reload keep the unsent prompt on New session', async ({
  admin,
  labAgent,
}) => {
  test.setTimeout(300_000);
  const label = await signOutOfFixture(admin);

  await open(admin, '/');
  await expect(prompt(admin)).toBeVisible({ timeout: 60_000 });
  await agentPicker(admin).click();
  // The agent may be listed twice: under Recent and in its namespace.
  await admin
    .getByRole('option', { name: new RegExp(labAgent.name) })
    .first()
    .click();
  await expect(agentPicker(admin)).toContainText(labAgent.name);
  await prompt(admin).fill(PROMPT);

  // The inbox's sign-in: the provider opens in a new tab, this page stays.
  const overlay = await openInbox(admin);
  const row = fixtureRow(overlay, label);
  await expect(row).toBeVisible({ timeout: 60_000 });
  await row.getByRole('button', { name: 'Sign in to connectors' }).click();
  const dialog = admin.getByRole('dialog', { name: 'Sign in to connectors' });
  const server = dialog.getByRole('listitem').filter({ hasText: label });
  await completeDexLogin(
    await openThroughConsent(
      admin,
      server.getByRole('button', { name: 'Sign in' }),
    ),
    lab.users.admin,
  );
  await expect(server).toContainText('Connected', { timeout: 60_000 });
  await dialog
    .getByRole('button')
    .filter({ hasText: /^(Done|Close)$/ })
    .click();
  await expect(dialog).toBeHidden();

  await expect
    .poll(() => new URL(admin.url()).pathname, {
      message: 'the page it was started from',
    })
    .toBe('/');
  await expect(prompt(admin)).toHaveValue(PROMPT);
  await expect(agentPicker(admin)).toContainText(labAgent.name);

  // A reload, as a sign-in that left the page would be: the draft comes back.
  await admin.reload();
  await expect(prompt(admin)).toHaveValue(PROMPT, { timeout: 60_000 });
  await expect(agentPicker(admin)).toContainText(labAgent.name, {
    timeout: 60_000,
  });

  // Emptied by hand, nothing is kept: the tab's storage says so, since an
  // empty box after a reload could also be one the draft is not read into
  // yet.
  await expect.poll(() => storedDrafts(admin)).toHaveLength(1);
  await prompt(admin).fill('');
  await expect
    .poll(() => storedDrafts(admin), { message: 'the emptied draft is gone' })
    .toEqual([]);
  await admin.reload();
  await expect(prompt(admin)).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => storedDrafts(admin)).toEqual([]);
  await expect(prompt(admin)).toHaveValue('');

  // Leave the fixture as the lab ships it, for the inbox's own spec.
  await signOutOfFixture(admin);
});
