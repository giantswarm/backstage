import {
  completeDexLogin,
  expect,
  open,
  test,
  watchPageErrors,
} from './fixtures';
import { lab } from './lab';

/**
 * The sign-in the portal's only login provider offers in the lab: the Dex
 * card, the popup to the lab Dex, the fixture account, and back. Every lab
 * user signs in, sees their own identity on Settings, and signs out again.
 */
for (const user of Object.values(lab.users)) {
  test(`signs in as ${user.email} through the Dex popup, shows the identity on Settings, signs out`, async ({
    signInAs,
  }) => {
    const page = await signInAs(user);
    const errors = watchPageErrors(page);

    await open(page, '/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: user.name }),
      'the Profile card names the signed-in user',
    ).toBeVisible();
    await expect(page.getByText(`User Entity: ${user.name}`)).toBeVisible();

    // The Profile card's menu carries Sign Out; the sign-in page is back.
    await page.getByRole('button', { name: 'more' }).click();
    await page.getByRole('menuitem', { name: /sign out/i }).click();
    await expect(
      page.getByRole('button', { name: 'Sign In' }),
      'signing out returns to the sign-in page',
    ).toBeVisible();

    expect(errors, 'no uncaught errors on the page').toEqual([]);
  });
}

test('a wrong password is refused by Dex and the portal stays signed out', async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: lab.baseURL,
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  await page.goto('/');
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Sign In' }).click();
  const dex = await popup;
  await dex.waitForLoadState('domcontentloaded');
  await dex.locator('input[name="login"]').fill(lab.users.viewer.email);
  await dex.locator('input[name="password"]').fill('not-the-fixture-password');
  await dex.getByRole('button', { name: 'Login' }).click();

  await expect(
    dex.getByText(/invalid/i),
    'Dex names the refusal on its own page',
  ).toBeVisible();
  await expect(dex.locator('input[name="password"]')).toBeVisible();
  await dex.close();
  await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'sidebar nav' }),
  ).not.toBeAttached();
  await context.close();
});

test('the fixture password completes a login that a wrong one refused', async ({
  browser,
}) => {
  // The same popup, second attempt: Dex keeps the authorization request alive
  // across a refused login, so a typo does not cost the person a new Sign In.
  const context = await browser.newContext({
    baseURL: lab.baseURL,
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  await page.goto('/');
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Sign In' }).click();
  const dex = await popup;
  await dex.waitForLoadState('domcontentloaded');
  await dex.locator('input[name="login"]').fill(lab.users.dev.email);
  await dex.locator('input[name="password"]').fill('typo');
  await dex.getByRole('button', { name: 'Login' }).click();
  await expect(dex.getByText(/invalid/i)).toBeVisible();

  await completeDexLogin(dex, lab.users.dev);
  await expect(
    page.getByRole('navigation', { name: 'sidebar nav' }),
  ).toBeAttached({ timeout: 60_000 });
  await context.close();
});
