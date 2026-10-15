import type { Page, Request } from '@playwright/test';
import { connectToMuster, expect, open, signIn, test } from './fixtures';
import { contextOptionsFor, lab } from './lab';

/**
 * A portal tab left open past the Dex ID token's lifetime: the token the
 * portal forwards to muster is refreshed before it lapses, and when no fresh
 * one can be had the person reads "Your session expired, sign in again." with
 * the Sign in again action, never muster's raw "token has expired …
 * re-authenticate".
 *
 * The page's clock is moved forward (Playwright's fake clock) instead of
 * waiting out the lab Dex's ID token lifetime: the portal judges the token by
 * the browser's clock, Dex and muster by the real one.
 */

const scope = `?installation=${lab.installation}`;
const yourConnectorsPath = `/customize/connectors${scope}`;
const internalPath = `/customize/connectors/internal${scope}`;
const MUSTER_AUTH_HEADER = 'backstage-muster-authorization';
const EXPIRED_COPY = 'Your session expired, sign in again.';

function jwtExp(token: string): number {
  const payload = token.split('.')[1];
  const json = Buffer.from(payload, 'base64url').toString('utf8');
  return (JSON.parse(json) as { exp: number }).exp * 1000;
}

/** Every token the page forwarded to muster, with the page's time it left at. */
function recordMusterTokens(page: Page, now: () => number) {
  const sent: { token: string; at: number }[] = [];
  page.on('request', (request: Request) => {
    const token = request.headers()[MUSTER_AUTH_HEADER];
    if (token && request.url().includes('/api/muster/')) {
      sent.push({ token, at: now() });
    }
  });
  return sent;
}

async function openSignedInWithClock(
  browser: import('@playwright/test').Browser,
) {
  const context = await browser.newContext(contextOptionsFor('desktop'));
  const page = await context.newPage();
  await page.clock.install();
  await signIn(page, lab.users.admin);
  return { context, page };
}

/** Moves to the other Connectors sub-tab in the app, so the page asks muster again without a reload. */
async function switchSubTab(page: Page, name: RegExp) {
  await page.getByRole('tab', { name }).click();
}

test('an ID token near its exp is refreshed before it is forwarded to muster', async ({
  browser,
}) => {
  const { context, page } = await openSignedInWithClock(browser);
  let skew = 0;
  const sent = recordMusterTokens(page, () => Date.now() + skew);

  await open(page, yourConnectorsPath);
  await connectToMuster(page, page.getByRole('grid'));
  expect(sent.length, 'the page forwarded a token to muster').toBeGreaterThan(
    0,
  );
  const first = sent[sent.length - 1].token;
  const lifetime = jwtExp(first) - Date.now();

  // Two minutes before the token lapses: inside the session's refresh window,
  // outside the client's one-minute skew.
  skew = lifetime - 120_000;
  await page.clock.fastForward(skew);
  const before = sent.length;
  await switchSubTab(page, /^Internal/);
  await expect(page).toHaveURL(/\/customize\/connectors\/internal/);
  await expect.poll(() => sent.length).toBeGreaterThan(before);

  const after = sent.slice(before);
  for (const { token, at } of after) {
    expect(token, 'the lapsing token is never forwarded again').not.toBe(first);
    expect(jwtExp(token), 'a forwarded token is valid').toBeGreaterThan(at);
  }
  await expect(page.getByText(EXPIRED_COPY)).toHaveCount(0);
  await expect(page.getByText(/token has expired/i)).toHaveCount(0);
  await context.close();
});

test('a tab past the token’s lifetime offers Sign in again, never the raw muster error', async ({
  browser,
}) => {
  const { context, page } = await openSignedInWithClock(browser);
  let skew = 0;
  const sent = recordMusterTokens(page, () => Date.now() + skew);

  await open(page, yourConnectorsPath);
  await connectToMuster(page, page.getByRole('grid'));
  const first = sent[sent.length - 1].token;

  // Past the token's lifetime as the browser sees it: a refresh hands a token
  // Dex dates by the real clock, still expired on the page's.
  skew = jwtExp(first) - Date.now() + 120_000;
  await page.clock.fastForward(skew);
  const before = sent.length;
  await switchSubTab(page, /^Internal/);

  await expect(page.getByText(EXPIRED_COPY).first()).toBeVisible({
    timeout: 60_000,
  });
  await expect(
    page.getByRole('button', { name: 'Sign in again' }).first(),
  ).toBeVisible();
  await expect(page.getByText(/token has expired/i)).toHaveCount(0);
  for (const { token, at } of sent.slice(before)) {
    expect(jwtExp(token), 'no expired token reaches muster').toBeGreaterThan(
      at,
    );
  }
  await context.close();
});

test("muster's expired-token answer reads as Sign in again", async ({
  admin,
}) => {
  await admin.route('**/api/muster/tools/filter*', route =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          name: 'MusterToolError',
          message:
            'token has expired for workspace-manager, re-authenticate to refresh: token is expired',
        },
      }),
    }),
  );
  await open(admin, internalPath);

  await expect(admin.getByText(EXPIRED_COPY).first()).toBeVisible({
    timeout: 60_000,
  });
  await expect(
    admin.getByRole('button', { name: 'Sign in again' }).first(),
  ).toBeVisible();
  await expect(admin.getByText(/token has expired/i)).toHaveCount(0);
});
