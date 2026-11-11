import type { Page } from '@playwright/test';
import {
  completeDexLogin,
  connectToMuster,
  expect,
  open,
  test,
  openThroughConsent,
} from './fixtures';
import { lab } from './lab';

/**
 * A tool call muster answers with an MCP URL elicitation (protocol
 * 2026-07-28 `input_required`): the portal declares URL mode on every tool
 * call, so a run of a `lab-oauth-fixture` tool whose sign-in the person lost
 * (signed out in another tab while its page stays open) puts muster's sign-in
 * page to the person in the consent dialog, and the call is sent again with
 * their answer. Accepted, the page opens in a new tab, the Dex sign-in
 * completes there and the run shows its result; declined, muster answers the
 * call's error and nothing opens.
 */

const FIXTURE = 'lab-oauth-fixture';
/** Read-only, and there on the fixture, which is a muster. */
const TOOL = 'list_tools';
const scope = `?installation=${lab.installation}`;
const connectorsPath = `/customize/connectors${scope}`;
const fixturePage = `/customize/connectors/${lab.installation}/${FIXTURE}`;
const toolRunPage = `${fixturePage}/tools/x_${FIXTURE}_${TOOL}/run`;

/**
 * The fixture's page with its Tools tab open, its CR settled; the page's own
 * Sign in, offered while the person is signed out of it.
 */
async function openFixture(page: Page) {
  await open(page, fixturePage);
  await expect(
    page.getByRole('main'),
    'the fixture CR has settled (Auth Required, or Connected from an earlier sign-in)',
  ).toContainText(/Auth Required|Connected/, { timeout: 120_000 });
  await page.getByRole('tab', { name: /^Tools/ }).click();
  const signIn = page
    .getByRole('main')
    .getByRole('button', { name: 'Sign in' })
    .first();
  await expect(
    signIn.or(page.getByRole('tab', { name: /^Tools \([1-9]/ })).first(),
  ).toBeVisible({ timeout: 60_000 });
  return signIn;
}

/** Signed in to the fixture, through its page's own Sign in when needed. */
async function signInToFixture(admin: Page) {
  const signIn = await openFixture(admin);
  if (await signIn.isVisible()) {
    await completeDexLogin(
      await openThroughConsent(admin, signIn),
      lab.users.admin,
    );
    await expect(signIn).toBeHidden({ timeout: 60_000 });
  }
}

/** Signs the person out of the fixture from a tab of its own. */
async function signOutInAnotherTab(admin: Page) {
  const other = await admin.context().newPage();
  const signIn = await openFixture(other);
  if (!(await signIn.isVisible())) {
    await other.getByRole('button', { name: 'More actions' }).click();
    await other.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(signIn).toBeVisible({ timeout: 60_000 });
  }
  await other.close();
}

/**
 * The tool's Run, its page opened while signed in to the fixture; then the
 * sign-in is lost in another tab, the page staying as it is.
 */
async function runWithSignInLost(admin: Page) {
  await open(admin, connectorsPath);
  await connectToMuster(admin, admin.getByRole('grid'));
  await signInToFixture(admin);
  await open(admin, toolRunPage);
  await expect(
    admin.getByRole('heading', { level: 2, name: 'Try it', exact: true }),
  ).toBeVisible({ timeout: 60_000 });
  await signOutInAnotherTab(admin);
  return admin.getByRole('button', { name: 'Run', exact: true });
}

const result = (admin: Page) =>
  admin.getByRole('heading', { level: 2, name: 'Result', exact: true });

test.describe.configure({ mode: 'serial' });

test('a run that needs a sign-in asks in the consent dialog, signs in through Dex and shows its result', async ({
  admin,
}) => {
  test.setTimeout(360_000);
  const run = await runWithSignInLost(admin);

  const consent = admin.getByRole('dialog', { name: /^Open a page for / });
  const dex = await openThroughConsent(admin, run);
  await expect(consent).toBeHidden();
  await completeDexLogin(dex, lab.users.admin);

  await expect(
    result(admin),
    'the call sent again with the accept ran once the sign-in completed',
  ).toBeVisible({ timeout: 120_000 });

  // Leave the fixture as the lab ships it: signed out.
  await signOutInAnotherTab(admin);
});

test('a declined sign-in opens nothing and the run shows why it did not run', async ({
  admin,
}) => {
  test.setTimeout(300_000);
  const run = await runWithSignInLost(admin);

  await run.click();
  const consent = admin.getByRole('dialog', { name: /^Open a page for / });
  await expect(consent).toBeVisible({ timeout: 60_000 });
  await expect(consent).toContainText(`Sign in to ${FIXTURE} to continue`);
  await expect(consent).toContainText('/oauth/proxy/start');

  let opened = false;
  admin.on('popup', () => {
    opened = true;
  });
  await consent.getByRole('button', { name: "Don't open page" }).click();

  await expect(
    admin.getByRole('main'),
    "muster's answer to the declined sign-in",
  ).toContainText(`answered decline to signing in to ${FIXTURE}`, {
    timeout: 60_000,
  });
  await expect(result(admin)).toBeHidden();
  expect(opened).toBe(false);
});
