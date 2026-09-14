import {
  test as base,
  expect,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { contextOptions, lab, type LabUser } from './lab';

export { expect };

/**
 * Submits the lab Dex's login form in the popup the portal opened, with the
 * fixture password unless the test passes another (the wrong-password case),
 * and waits for Dex to send the popup on: the portal's own sign-in closes it
 * from Backstage's handler page, a per-server sign-in through muster's OAuth
 * proxy lands it on muster's completion page. Either way the popup has left
 * Dex when this resolves; a popup still open is closed, the opener has what
 * it needs by then.
 */
export async function completeDexLogin(
  dex: Page,
  user: LabUser,
  password: string = lab.password,
): Promise<void> {
  await dex.waitForLoadState('domcontentloaded');
  await expect(dex, 'the popup lands on the lab Dex').toHaveURL(/\/dex\//);
  await dex.locator('input[name="login"]').fill(user.email);
  await dex.locator('input[name="password"]').fill(password);
  const closed = dex.waitForEvent('close', { timeout: 60_000 }).then(
    () => true,
    () => false,
  );
  const leftDex = dex
    .waitForURL(url => !url.pathname.includes('/dex/'), { timeout: 60_000 })
    .then(
      () => true,
      () => false,
    );
  await dex.getByRole('button', { name: 'Login' }).click();
  const done = await Promise.race([closed, leftDex]);
  expect(done, 'Dex accepted the login and sent the popup on').toBe(true);
  if (!dex.isClosed()) {
    // A completion page: give it a moment in case it closes itself, then
    // close it the way a person would.
    await Promise.race([closed, new Promise(r => setTimeout(r, 3000))]);
    if (!dex.isClosed()) {
      await dex.close();
    }
  }
}

/**
 * Signs `page` in as a lab user the way a person does: the Dex card's
 * **Sign In** opens the popup, the lab Dex asks for the fixture account, and
 * the portal renders signed in. Fails with the page's state when the card is
 * not offered (the app did not load) or the popup never closes (Dex refused,
 * or the handler page did not hand the session to the opener).
 */
export async function signIn(page: Page, user: LabUser): Promise<void> {
  await page.goto('/');
  const card = page.getByRole('button', { name: 'Sign In' });
  await expect(card, 'the sign-in page offers the Dex card').toBeVisible();
  const popup = page.waitForEvent('popup');
  await card.click();
  await completeDexLogin(await popup, user);
  await expect(
    page.getByRole('navigation', { name: 'sidebar nav' }),
    `the portal renders signed in as ${user.email}`,
  ).toBeAttached({ timeout: 60_000 });
}

/**
 * Uncaught exceptions on a page are bugs in the bundle, whatever the lab's
 * state; a failed fetch the app handles is not (those show as console errors,
 * which the lab produces in numbers — an unreachable host model server, a
 * vm-manager that is not running — and are left alone).
 */
export function watchPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  return errors;
}

type WorkerFixtures = {
  /**
   * One page per worker, signed in as the lab admin once and kept for the
   * worker's lifetime; every test navigates it.
   *
   * Why not Playwright's usual saved `storageState`, and why the page that
   * signed in stays open: the portal's session rests on Dex's refresh token,
   * which Dex rotates on every silent re-login (each page load). Two live
   * contexts holding a copy of the same cookie invalidate each other's session
   * on their next load, a state file goes stale as soon as one context used
   * it, and closing the page that just signed in cuts its first rotation
   * mid-flight — the next page then finds the sign-in card. One live page
   * per worker, no copies, is the shape that stays signed in.
   */
  adminPage: Page;
};

type TestFixtures = {
  /** The worker's admin page; an uncaught page error during the test fails it. */
  admin: Page;
  /**
   * Signs a fresh context in as the given user and returns its page; the
   * context closes with the test. For the sign-in flow itself and for what a
   * developer or viewer sees.
   */
  signInAs: (user: LabUser) => Promise<Page>;
};

export const test = base.extend<TestFixtures, WorkerFixtures>({
  adminPage: [
    async ({ browser }, use) => {
      const context = await browser.newContext(contextOptions);
      const page = await context.newPage();
      await signIn(page, lab.users.admin);
      await use(page);
      await context.close();
    },
    { scope: 'worker' },
  ],

  admin: async ({ adminPage }, use) => {
    const errors: string[] = [];
    const record = (error: Error) => errors.push(error.message);
    adminPage.on('pageerror', record);
    await use(adminPage);
    adminPage.off('pageerror', record);
    expect(errors, 'no uncaught errors on the page').toEqual([]);
  },

  signInAs: async ({ browser }, use) => {
    const contexts: BrowserContext[] = [];
    await use(async user => {
      const context = await browser.newContext(contextOptions);
      contexts.push(context);
      const page = await context.newPage();
      await signIn(page, user);
      return page;
    });
    await Promise.all(contexts.map(context => context.close()));
  },
});

/** The Agent Platform section's top-level tabs, in the order the portal shows them. */
export const agentPlatformTabs = [
  'Agents',
  'Sessions',
  'Models',
  'Usage',
  'MCP Servers',
] as const;

/**
 * Opens `path` on a signed-in page and waits for the portal's chrome, so
 * assertions see a rendered app. The sidebar is in the DOM only for a
 * signed-in app; Playwright counts its collapsed `nav` as not visible, hence
 * attached rather than visible.
 *
 * When the sign-in card shows instead — a Backstage pod roll in the shared lab
 * drops every session — the page signs in again as `user` and retries once,
 * so a lab event mid-run does not read as a portal failure.
 */
export async function open(
  page: Page,
  path: string,
  user: LabUser = lab.users.admin,
): Promise<void> {
  await page.goto(path);
  const chrome = page.getByRole('navigation', { name: 'sidebar nav' });
  const card = page.getByRole('button', { name: 'Sign In' });
  await expect(chrome.or(card).first()).toBeAttached();
  if (await card.isVisible()) {
    await signIn(page, user);
    await page.goto(path);
  }
  await expect(chrome).toBeAttached();
}
