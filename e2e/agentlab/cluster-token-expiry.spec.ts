import type { Page, Request } from '@playwright/test';
import {
  completeDexLogin,
  dismissInboxToasts,
  expect,
  open,
  signIn,
  test,
} from './fixtures';
import { contextOptionsFor, lab } from './lab';
import { SESSION_EXPIRED_MESSAGE } from '../../plugins/kubernetes-react/src/lib/clusterTokenError';
import { hasUserGesture, idleTab, touch } from './userActivation';
import { loginRequestedBy } from './loginRequest';

/**
 * The broker-backed cluster-token mint after the portal session expired, on a
 * portal with several installations: the cluster-access probe re-mints every
 * covered installation's token on its own timer and never opens the Login
 * Required dialog; a read the person starts still asks for the sign-in.
 *
 * The lab is one installation, so two more are staged at the browser: the
 * signed-in config (`GET /api/gs/config`) gains them as Dex targets
 * (`gs.clusterTokenBroker.targets`), their cluster tokens are answered at the
 * portal's mint route, and their apiservers at the Kubernetes proxy.
 * Everything the mint asks first is the lab's own: the Dex session and the
 * portal's refresh route.
 */
const STAGED = ['mint-e2e-one', 'mint-e2e-two'];

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

function stagedCluster(request: Request): string | undefined {
  const cluster = request.headers()['backstage-kubernetes-cluster'];
  return STAGED.includes(cluster) ? cluster : undefined;
}

/**
 * Stages the two installations. Returns the mints and apiserver reads the
 * page sends for them, in order.
 */
async function stageInstallations(page: Page) {
  const mints: string[] = [];
  const reads: string[] = [];
  await page.route('**/api/gs/config', async route => {
    const response = await route.fetch();
    const config = await response.json();
    config.gs ??= {};
    config.gs.installations ??= {};
    config.gs.clusterTokenBroker ??= {};
    config.gs.clusterTokenBroker.targets ??= {};
    for (const name of STAGED) {
      config.gs.installations[name] = {
        authProvider: 'oidc',
        oidcTokenProvider: `oidc-${name}`,
        pipeline: 'testing',
      };
      config.gs.clusterTokenBroker.targets[name] = {};
    }
    await route.fulfill({ response, json: config });
  });
  await page.route('**/api/auth/cluster-token/**', async route => {
    const name = decodeURIComponent(
      new URL(route.request().url()).pathname.split('/').pop()!,
    );
    if (!STAGED.includes(name)) {
      await route.fallback();
      return;
    }
    mints.push(name);
    await route.fulfill({
      json: { token: `e2e-cluster-token-${name}`, expiresInSeconds: 600 },
    });
  });
  await page.route('**/api/kubernetes/**', async route => {
    const cluster = stagedCluster(route.request());
    if (!cluster) {
      await route.fallback();
      return;
    }
    reads.push(`${cluster} ${new URL(route.request().url()).pathname}`);
    await route.fulfill({ json: { kind: 'List', items: [] } });
  });
  return { mints, reads };
}

/**
 * Expires the portal session: its refresh is refused, as Dex's would be, and
 * the page's clock moves past the lifetime of every token the browser holds.
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

function clusterAccess(page: Page) {
  return page.getByText('Cluster access', { exact: true }).first();
}

test('a background cluster-token mint after the session expired opens no Login Required dialog; the person’s read does', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const context = await browser.newContext(contextOptionsFor('desktop'));
  try {
    const page = await context.newPage();
    await page.clock.install();
    await idleTab(page);
    await dismissInboxToasts(page);
    const { mints, reads } = await stageInstallations(page);
    await signIn(page, lab.users.admin);
    await open(page, '/settings');

    // While the session lives, the probe mints both installations' tokens
    // through the main login alone and reads their apiservers.
    await expect
      .poll(() => [...new Set(mints)].sort(), {
        message: 'the probe mints a token per staged installation',
        timeout: 60_000,
      })
      .toEqual(STAGED);
    await expect
      .poll(() => reads.length, { timeout: 30_000 })
      .toBeGreaterThanOrEqual(STAGED.length);

    expect(
      await hasUserGesture(page),
      'the tab reports no user gesture while nobody touches it',
    ).toBe(false);
    mints.length = 0;
    reads.length = 0;
    await expireSession(page);
    // Past the probe's five-minute interval twice: every covered installation
    // needs a new token, and the mint finds the main session gone.
    await page.clock.runFor('00:11:00');
    await page.waitForTimeout(10_000);

    expect(
      await prompts(page, 5_000),
      'the background mint opened no Login Required dialog',
    ).toBe(false);
    expect(mints, 'no token is minted without a session').toEqual([]);
    expect(reads, 'no apiserver is read without a token').toEqual([]);

    await clusterAccess(page).click();
    for (const name of STAGED) {
      await expect(
        page.getByText(name, { exact: true }),
        `${name} is listed in Cluster access`,
      ).toBeVisible();
    }
    await expect(
      page.getByText(SESSION_EXPIRED_MESSAGE).first(),
      'the popover tells the person the session expired',
    ).toBeVisible();
    await test.info().attach('background-mint-after-expiry', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });

    // The person acts: switching an installation off asks for the sign-in,
    // and the mint is among the callers the open dialog names. Nothing
    // reaches the staged apiservers before it.
    await touch(page);
    // The bui switch's input is visually hidden: its label takes the click.
    const toggle = page.locator('label').filter({
      has: page.getByRole('switch', {
        name: `Enable installation ${STAGED[0]}`,
      }),
    });
    await toggle.click();
    await expect(
      loginRequired(page),
      'the person’s action asks for the sign-in',
    ).toBeVisible({ timeout: 60_000 });
    expect(
      await loginRequestedBy(page),
      'the installation’s token mint asked for the sign-in',
    ).toContain('cluster-token-mint');
    expect(mints, 'nothing is minted before the sign-in').toEqual([]);
    expect(reads, 'nothing reached the apiserver before the sign-in').toEqual(
      [],
    );
    await test.info().attach('person-action-prompts', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });

    // Signed in again, the person's read of the installation mints its token
    // through the main login and reaches its apiserver.
    await page.unroute('**/api/auth/*/refresh**');
    const popup = page.waitForEvent('popup');
    await loginRequired(page)
      .getByRole('button', { name: 'Log in' })
      .first()
      .click();
    await completeDexLogin(await popup, lab.users.admin);
    await expect(loginRequired(page)).toBeHidden({ timeout: 30_000 });
    expect(
      await loginRequestedBy(page),
      'no caller waits on the sign-in once it completed',
    ).toEqual([]);
    await toggle.click();
    await expect
      .poll(() => mints, {
        message: 'the person’s read mints the installation’s token',
        timeout: 60_000,
      })
      .toContain(STAGED[0]);
    await expect
      .poll(() => reads.some(read => read.startsWith(`${STAGED[0]} `)), {
        message: 'and reads its apiserver',
        timeout: 30_000,
      })
      .toBe(true);
    await expect(
      page.getByText(SESSION_EXPIRED_MESSAGE),
      'Cluster access no longer reports the session expired',
    ).toHaveCount(0, { timeout: 30_000 });
  } finally {
    await context.close();
  }
});
