import type { Page } from '@playwright/test';
import { expect, open, test } from './fixtures';

/**
 * The Platform section (`/platform`, giantswarm/giantswarm#39295), on a lab
 * serving the shell. It exists only where the deployment sets
 * `gs.features.platformSection.enabled`: without it, the rail has no Platform
 * item and `/platform` is no page, as before the section existed. With it,
 * the rail's Platform item opens the Clusters tab, whose list, column picker
 * and sortable headers the person can use, and whose rows open a cluster's
 * page with its Overview tab.
 */

const rail = (page: Page) =>
  page.getByRole('navigation', { name: 'Main', exact: true });

async function platformItem(page: Page) {
  await open(page, '/sessions');
  await expect(rail(page)).toBeAttached();
  return rail(page).getByRole('link', { name: 'Platform', exact: true });
}

test('without the setting, the shell has no Platform section', async ({
  admin,
}) => {
  const item = await platformItem(admin);
  test.skip(
    (await item.count()) > 0,
    'the lab sets gs.features.platformSection.enabled',
  );
  await open(admin, '/platform/clusters');
  await expect(
    admin.getByRole('heading', { name: 'Platform', exact: true }),
  ).toHaveCount(0);
});

test('the Platform item opens the clusters list', async ({ admin }) => {
  const item = await platformItem(admin);
  test.skip(
    (await item.count()) === 0,
    'the lab does not set gs.features.platformSection.enabled',
  );
  await expect(item).toHaveAttribute('href', '/platform');
  await item.click();

  await expect(admin).toHaveURL(/\/platform\/clusters$/);
  await expect(
    admin.getByRole('heading', { name: 'Platform', exact: true }),
  ).toBeVisible();
  await expect(admin.getByRole('tab', { name: /^Clusters/ })).toBeVisible();

  const table = admin.getByRole('grid');
  const empty = admin.getByText('No clusters yet', { exact: true });
  await expect(table.or(empty)).toBeVisible({ timeout: 60_000 });
  if (await empty.isVisible()) {
    return;
  }

  // The default columns, every header sortable.
  for (const name of [
    'Name',
    'Status',
    'Environment',
    'Organization',
    'Release',
    'Workers',
    'Created',
  ]) {
    await expect(
      table.getByRole('columnheader', { name, exact: true }),
    ).toBeVisible();
  }
  // Each name links to its cluster's page.
  await expect(table.getByRole('link').first()).toHaveAttribute(
    'href',
    /^\/platform\/clusters\/[^/]+\/[^/]+\/[^/]+$/,
  );

  // The column picker adds a column, keeps it on Escape, and takes it away
  // again.
  const columns = admin.getByRole('button', { name: 'Columns', exact: true });
  const picker = admin.getByRole('group', { name: 'Columns' });
  const region = table.getByRole('columnheader', {
    name: 'Region',
    exact: true,
  });
  await columns.click();
  await picker.getByRole('checkbox', { name: 'Region' }).check({ force: true });
  await admin.keyboard.press('Escape');
  await expect(picker).toBeHidden();
  await expect(region).toBeVisible();
  await columns.click();
  await picker
    .getByRole('checkbox', { name: 'Region' })
    .uncheck({ force: true });
  await admin.keyboard.press('Escape');
  await expect(region).toHaveCount(0);

  // A header sorts the list.
  const status = table.getByRole('columnheader', {
    name: 'Status',
    exact: true,
  });
  await status.click();
  await expect(status).toHaveAttribute('aria-sort', 'ascending');
});

test('a row opens its cluster’s page', async ({ admin }) => {
  const item = await platformItem(admin);
  test.skip(
    (await item.count()) === 0,
    'the lab does not set gs.features.platformSection.enabled',
  );
  await open(admin, '/platform/clusters');
  // A table row's name, or on a phone a stacked row's title.
  const name = admin.locator('a[href^="/platform/clusters/"]').first();
  const empty = admin.getByText('No clusters yet', { exact: true });
  await expect(name.or(empty)).toBeVisible({ timeout: 60_000 });
  test.skip(await empty.isVisible(), 'the lab has no clusters');

  const cluster = (await name.textContent())?.trim() ?? '';
  await name.click();

  await expect(admin).toHaveURL(/\/platform\/clusters\/[^/]+\/[^/]+\/[^/]+$/);
  await expect(
    admin.getByRole('heading', { level: 1, name: cluster, exact: true }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(admin.getByRole('tab', { name: 'Overview' })).toBeVisible();
  await expect(
    admin.getByRole('region', { name: 'Release', exact: true }),
  ).toBeVisible();
  await expect(
    admin.getByRole('button', { name: 'Ask Platform Agent' }),
  ).toHaveCount(0);

  // The breadcrumb leads back to the list.
  await admin
    .getByRole('navigation', { name: /breadcrumb/i })
    .getByRole('link', { name: 'Clusters', exact: true })
    .click();
  await expect(admin).toHaveURL(/\/platform\/clusters$/);
});
