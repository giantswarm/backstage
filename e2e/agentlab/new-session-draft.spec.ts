import type { Page } from '@playwright/test';
import { completeDexLogin, expect, open, test } from './fixtures';
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
  await row.getByRole('button', { name: 'Sign in to MCP servers' }).click();
  const dialog = admin.getByRole('dialog', { name: 'Sign in to MCP servers' });
  const server = dialog.getByRole('listitem').filter({ hasText: label });
  const popup = admin.waitForEvent('popup');
  await server.getByRole('button', { name: 'Sign in' }).click();
  await completeDexLogin(await popup, lab.users.admin);
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

  // Emptied by hand, nothing is kept.
  await prompt(admin).fill('');
  await admin.reload();
  await expect(prompt(admin)).toBeVisible({ timeout: 60_000 });
  await expect(prompt(admin)).toHaveValue('');

  // Leave the fixture as the lab ships it, for the inbox's own spec.
  await signOutOfFixture(admin);
});
