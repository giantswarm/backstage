import type { Locator, Page } from '@playwright/test';
import {
  completeDexLogin,
  connectToMuster,
  expect,
  expectWizardStep,
  fillAgentDetails,
  open,
  signIn,
  test,
} from './fixtures';
import { contextOptionsFor, lab } from './lab';

/**
 * The portal-wide notice that MCP servers wait for the person's own sign-in,
 * and its dialog, on the lab's `lab-oauth-fixture`: an OAuth-protected server
 * whose authorization server is muster itself, so the sign-in through the
 * dialog runs the real challenge chain (proxy start → muster → Dex).
 */

const FIXTURE = 'lab-oauth-fixture';
const fixturePath = `/agent-platform/connectors/${FIXTURE}?installation=${lab.installation}`;

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
  await open(admin, '/agent-platform/agents');
  await expect(admin.getByText('Agents').first()).toBeVisible();
  await expect(notice).toHaveCount(0);
});

test('the notice stands clear of the wizard footer: Continue takes the click while it shows', async ({
  admin,
}) => {
  test.setTimeout(240_000);
  await admin.setViewportSize({ width: 1440, height: 900 });
  await signOutOfFixture(admin);

  await open(admin, '/agent-platform/agents/new');
  // The worker keeps one page: a Not now earlier in the run hid the notice
  // for this browser session.
  await admin.evaluate(() =>
    window.sessionStorage.removeItem('muster.mcpAuthNotice.hidden'),
  );
  await open(admin, '/agent-platform/agents/new');
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

/** The notice, shown again: a Not now earlier in the run is forgotten. */
async function showNoticeOn(page: Page, path: string) {
  await open(page, path);
  await page.evaluate(() =>
    window.sessionStorage.removeItem('muster.mcpAuthNotice.hidden'),
  );
  await open(page, path);
  const notice = page.getByRole('complementary', {
    name: 'MCP server sign-in',
  });
  await expect(notice).toContainText(FIXTURE, { timeout: 60_000 });
  return notice;
}

/**
 * The last thing the page shows in its main region: the last rendered
 * element in document order that has a size, whatever the page put there.
 */
async function lastContent(page: Page): Promise<Locator> {
  await page.getByRole('main').evaluate(main => {
    const sized = Array.from(main.querySelectorAll('*')).filter(element => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    });
    sized[sized.length - 1]?.setAttribute('data-e2e-last-content', '');
  });
  return page.locator('[data-e2e-last-content]').last();
}

/**
 * Scrolls to the end of the page and asserts `last` ends above the notice:
 * the page reserves the room the notice covers under its last content.
 */
async function expectScrolledClearOfNotice(
  page: Page,
  notice: Locator,
  last: Locator,
  what: string,
) {
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  await expect
    .poll(
      async () => {
        const lastBox = await last.boundingBox();
        const noticeBox = await notice.boundingBox();
        return lastBox!.y + lastBox!.height - noticeBox!.y;
      },
      { message: `${what} ends above the notice at the end of the scroll` },
    )
    .toBeLessThanOrEqual(0.5);
}

test('on a phone the notice leaves the last content of a page reachable: Sessions, and Review’s Technical details', async ({
  admin,
}) => {
  test.setTimeout(300_000);
  await signOutOfFixture(admin);
  await admin.setViewportSize({ width: 375, height: 812 });
  try {
    // Sessions: the page's last content scrolls clear of the notice.
    const notice = await showNoticeOn(admin, '/agent-platform/sessions');
    await expect(
      admin.getByRole('heading', { level: 1, name: 'Sessions' }),
    ).toBeVisible();
    await expectScrolledClearOfNotice(
      admin,
      notice,
      await lastContent(admin),
      'the Sessions page’s last content',
    );

    // New agent → Review: Technical details, the last thing on the step, takes
    // the tap while the notice shows. Not forced: Playwright's actionability
    // check fails a tap the notice would receive.
    await open(admin, '/agent-platform/agents/new');
    await fillAgentDetails(admin, {
      name: 'Notice clearance phone probe',
      description: 'Never created: the run only steps through the wizard.',
      instructions: 'You are a probe.',
    });
    for (const step of ['Skills', 'Tools', 'Review']) {
      await admin.getByRole('button', { name: 'Continue' }).first().click();
      await expectWizardStep(admin, step);
    }
    await expect(notice, 'the notice is still shown').toBeVisible();
    const details = admin.getByText('Technical details');
    await expectScrolledClearOfNotice(
      admin,
      notice,
      details,
      'Technical details',
    );
    await details.click();
    await expect(
      admin.getByText(/notice-clearance-phone-probe/).first(),
      'Technical details opened',
    ).toBeVisible();
    await expect(notice, 'the notice was not dismissed').toBeVisible();

    // Not now gives the room back.
    await notice.getByRole('button', { name: 'Not now' }).click();
    await expect(notice).toHaveCount(0);
    await expect
      .poll(() =>
        admin.evaluate(() =>
          document.documentElement.style.getPropertyValue(
            '--floating-notice-clearance',
          ),
        ),
      )
      .toBe('');
  } finally {
    await admin.setViewportSize({ width: 1440, height: 900 });
  }
});

test('the notice’s status poll never asks for the sign-in once the portal session has expired', async ({
  admin,
  browser,
}) => {
  test.setTimeout(240_000);
  await signOutOfFixture(admin);
  const context = await browser.newContext(contextOptionsFor('desktop'));
  try {
    const page = await context.newPage();
    await page.clock.install();
    await signIn(page, lab.users.admin);
    // A page that reads nothing of its own (Not Found, the chrome alone):
    // whatever asks for the sign-in after the jump is the notice's doing.
    const notice = await showNoticeOn(page, '/mcp-auth-notice-e2e-quiet-page');

    // What the page itself has queued (a catalog lookup batches on a timer)
    // runs while the session is still good: after the jump, the page has
    // nothing of its own left to ask for a token.
    await page.clock.runFor(5_000);
    await page.waitForLoadState('networkidle');

    // The portal session is gone: its refresh is refused, as Dex's would be.
    await page.route('**/api/auth/*/refresh**', route =>
      route.fulfill({
        status: 401,
        json: { error: { name: 'AuthenticationError' } },
      }),
    );
    const statusReads: string[] = [];
    page.on('request', request => {
      if (request.url().includes('/api/muster/auth/status')) {
        statusReads.push(request.url());
      }
    });
    const refreshed = page.waitForRequest(request =>
      /\/api\/auth\/[^/]+\/refresh/.test(request.url()),
    );
    // Past the ID token's lifetime and several of the poll's intervals.
    await page.clock.fastForward('02:00:00');
    await refreshed;

    const login = page.getByRole('dialog', { name: 'Login Required' });
    const prompted = await login
      .waitFor({ state: 'visible', timeout: 10_000 })
      .then(
        () => true,
        () => false,
      );
    expect(prompted, 'the poll opened no Login Required dialog').toBe(false);
    expect(statusReads, 'no status read is sent without a session').toEqual([]);
    await expect(notice, 'the notice stays as it was').toBeVisible();

    // A person's own action still asks for the session: Sign in on the
    // notice, then on the server's row.
    await notice.getByRole('button', { name: 'Sign in' }).click();
    const dialog = page.getByRole('dialog', { name: 'Sign in to MCP servers' });
    await expect(dialog).toBeVisible();
    await dialog
      .getByRole('listitem')
      .filter({ hasText: FIXTURE })
      .getByRole('button', { name: 'Sign in' })
      .click();
    await expect(login, 'the action asks for the sign-in').toBeVisible({
      timeout: 60_000,
    });
    await test.info().attach('login-on-action', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  } finally {
    await context.close();
  }
});
