import type { Page } from '@playwright/test';
import { dismissMcpSignInNotice, expect, open, signIn, test } from './fixtures';
import { contextOptionsFor, lab } from './lab';

/**
 * A portal tab left open on `/catalog` or `/settings` after the portal session
 * expired: the catalog's own readers (the entity-presentation loader, the
 * catalog page's getEntities refetch) run on their own timers and never open
 * the Login Required dialog. An action the person starts still asks for the
 * sign-in.
 *
 * The page's clock is moved past the ID token's lifetime (Playwright's fake
 * clock) and the session's refresh is refused, as Dex's would be once the
 * refresh token is gone.
 */

function loginRequired(page: Page) {
  return page.getByRole('dialog', { name: 'Login Required' });
}

/** Whether the Login Required dialog shows within `timeout`. */
async function prompts(page: Page, timeout: number): Promise<boolean> {
  return loginRequired(page)
    .waitFor({ state: 'visible', timeout })
    .then(
      () => true,
      () => false,
    );
}

/** Every catalog request the page sends from now on. */
function recordCatalogRequests(page: Page): string[] {
  const sent: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/catalog/')) {
      sent.push(`${request.method()} ${url.pathname}`);
    }
  });
  return sent;
}

/**
 * Expires the portal session: its refresh is refused, as Dex's would be, and
 * the page's clock moves past the ID token's lifetime.
 */
async function expireSession(page: Page) {
  await page.route('**/api/auth/*/refresh**', route =>
    route.fulfill({
      status: 401,
      json: { error: { name: 'AuthenticationError' } },
    }),
  );
  await page.clock.fastForward('02:00:00');
}

/**
 * Reports the tab's user activation (`navigator.userActivation.isActive`) as
 * a browser does for a tab nobody touches, until {@link touch}: Playwright's
 * own calls (the fake clock's, a locator's) count as gestures, so under it a
 * page reads as just clicked all the time. The portal lets only a request a
 * person's gesture starts open the sign-in.
 */
async function idleTab(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'userActivation', {
      configurable: true,
      get: () => ({
        isActive: Boolean((window as any).__e2eUserGesture),
        hasBeenActive: true,
      }),
    });
  });
}

/** The person acts: the tab's next requests carry a user gesture. */
async function touch(page: Page) {
  await page.evaluate(() => {
    (window as any).__e2eUserGesture = true;
  });
}

for (const path of ['/catalog', '/settings']) {
  test(`idling on ${path} after the session expired opens no Login Required dialog`, async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const context = await browser.newContext(contextOptionsFor('desktop'));
    try {
      const page = await context.newPage();
      await page.clock.install();
      await idleTab(page);
      await dismissMcpSignInNotice(page);
      await signIn(page, lab.users.admin);
      await open(page, path);
      // The page settles and sits: what it read is past the entity
      // presentation cache's lifetime by the time the session lapses.
      await page.clock.runFor('00:05:00');

      const catalogReads = recordCatalogRequests(page);
      await expireSession(page);
      // Long enough for the readers' timers to come round several times,
      // and for what they started to settle in real time.
      await page.clock.runFor('00:10:00');
      await page.waitForTimeout(10_000);

      expect(
        await prompts(page, 5_000),
        `the readers on ${path} opened no Login Required dialog`,
      ).toBe(false);
      expect(
        catalogReads,
        'no catalog read leaves the page without a session',
      ).toEqual([]);
      await test.info().attach(`idle-${path.slice(1)}`, {
        body: await page.screenshot(),
        contentType: 'image/png',
      });

      // A person's own action still asks for the sign-in: opening Clusters
      // from the sidebar, in the app (no reload), reads the clusters with
      // the session's token on the interactive path.
      await touch(page);
      await page
        .getByRole('navigation', { name: 'sidebar nav' })
        .getByRole('link', { name: 'Clusters' })
        .click();
      await expect(
        loginRequired(page),
        'the person’s action asks for the sign-in',
      ).toBeVisible({ timeout: 60_000 });
      await test.info().attach(`login-on-action-${path.slice(1)}`, {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
    } finally {
      await context.close();
    }
  });
}
