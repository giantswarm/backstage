import type { Locator, Page } from '@playwright/test';
import { connectToMuster, expect, open } from './fixtures';
import { lab } from './lab';

/**
 * The Notification inbox's MCP sign-in row on the lab's `lab-oauth-fixture`:
 * an OAuth-protected server whose authorization server is muster itself, so a
 * sign-in through the row's dialog runs the real challenge chain (proxy start
 * → muster → Dex). Shared by the specs that sign in from the inbox.
 */

export const FIXTURE = 'lab-oauth-fixture';
export const fixturePath = `/customize/connectors/${lab.installation}/${FIXTURE}`;

/**
 * Leaves the fixture signed out for the admin, as the lab ships it: from its
 * connector page, as a person does (`mcp-servers.spec.ts` does the same).
 * Resolves what the portal calls it (the page's title): the row and the
 * dialog name it so, its display name if it has one.
 */
export async function signOutOfFixture(page: Page): Promise<string> {
  await open(page, fixturePath);
  const heading = page.getByRole('heading', { level: 1 });
  await connectToMuster(page, heading);
  const label = (await heading.innerText()).trim();
  await page.getByRole('tab', { name: /^Tools/ }).click();
  const fixtureSignIn = page.getByRole('button', { name: 'Sign in' }).first();
  await expect(
    fixtureSignIn.or(page.getByRole('tab', { name: /^Tools \([1-9]/ })).first(),
    'the fixture offers Sign in, or its tools once signed in',
  ).toBeVisible({ timeout: 120_000 });
  if (!(await fixtureSignIn.isVisible())) {
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(fixtureSignIn).toBeVisible({ timeout: 60_000 });
  }
  return label;
}

/**
 * Opens the bell's overlay on the rail's Profile row, or takes it as it is
 * when it is open already (its underlay then takes a click on the bell).
 */
export async function openInbox(page: Page): Promise<Locator> {
  const overlay = page.getByRole('dialog', { name: 'Notifications' });
  if (!(await overlay.isVisible())) {
    await page.getByRole('button', { name: /^Notifications/ }).click();
  }
  await expect(overlay).toBeVisible();
  return overlay;
}

/** The overlay's MCP sign-in row, naming the fixture by `label`. */
export function fixtureRow(overlay: Locator, label: string): Locator {
  return overlay
    .getByRole('listitem')
    .filter({ hasText: /connectors? needs? your sign-in/ })
    .filter({ hasText: label });
}
