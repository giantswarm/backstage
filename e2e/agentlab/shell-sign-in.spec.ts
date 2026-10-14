import { expect, test, watchPageErrors } from './fixtures';
import { lab } from './lab';

/**
 * The shell's sign-in card leads with the full Giant Swarm logo, in the brand
 * file's colors (`giantswarm/brand` `logo/standard`), as its title. The lab
 * ships no branding assets, so the Giant Swarm lockup shows. Signed out: the
 * branding manifest is fetched without the identity middleware, which would
 * wait for a sign-in that has not happened.
 */
test('the sign-in card shows the full Giant Swarm logo as its title', async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: lab.baseURL,
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  const errors = watchPageErrors(page);
  await page.goto('/');

  const title = page.getByRole('heading', { level: 1, name: 'Giant Swarm' });
  await expect(title, 'the logo names the title').toBeVisible();
  const logo = title.getByRole('img', { name: 'Giant Swarm' });
  await expect(logo).toBeVisible();
  // The wordmark in the brand file's #234A61, the ant in its gradient.
  await expect(logo).toHaveCSS('color', 'rgb(35, 74, 97)');
  await expect(logo.locator('stop')).toHaveCount(2);
  await expect(
    page.getByRole('region', { name: 'Giant Swarm' }),
    'the card takes the logo’s name',
  ).toBeVisible();
  await expect(page.getByText('Agent Platform', { exact: true })).toHaveCount(
    0,
  );

  expect(errors, 'no uncaught errors on the page').toEqual([]);
  await context.close();
});
