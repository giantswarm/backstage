import { expect, open, test } from './fixtures';

/**
 * Models in the agent shell: the installation's `ModelConfig`s read through
 * the Kubernetes proxy with the person's token, as Customize's Models tab
 * (the lab always provisions `default-model-config`, its `aiModel`, so the
 * table has a row to show), and Model hosting's tabs under it.
 */

test('Customize · Models lists the lab default ModelConfig and offers Connect a model', async ({
  admin,
}) => {
  // The old address of the list lands on Customize's Models tab.
  await open(admin, '/agent-platform/models');
  await expect(admin).toHaveURL(/\/customize\/models$/);
  await expect(
    admin.getByRole('main').getByRole('tab', { name: /^Models/ }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(
    admin.getByRole('link', { name: 'Connect a model' }),
  ).toHaveAttribute('href', '/agent-platform/models/new');
  await expect(
    admin.getByRole('rowheader', { name: /^default-model-config/ }),
    'the ModelConfig the lab provisions is listed',
  ).toBeVisible();
  // The way into Model hosting.
  await expect(
    admin.getByRole('link', { name: 'Model hosting' }),
  ).toHaveAttribute('href', '/agent-platform/models/serving');
});

test('the old Model configs path still resolves', async ({ admin }) => {
  // The list used to live at `/models/configs`, with the create and detail
  // flows beneath it. Bookmarks and links from an older release carry those
  // paths, so they redirect rather than 404.
  await open(admin, '/agent-platform/models/configs');
  await expect(admin).toHaveURL(/\/customize\/models$/);
  await expect(
    admin.getByRole('rowheader', { name: /^default-model-config/ }),
    'the redirect lands on the list, not an empty page',
  ).toBeVisible();
});

test('Model hosting’s Running models and GPU tabs render for the installation', async ({
  admin,
}) => {
  await open(admin, '/agent-platform/models/serving');
  await expect(
    admin.getByRole('heading', { level: 1, name: 'Model hosting' }),
  ).toBeVisible();
  await expect(
    admin.getByRole('tab', { name: 'Running models' }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(admin.getByRole('article').first()).toBeVisible();

  // "GPU pools" where cluster-manager runs, "GPU capacity" (nodes only)
  // where it does not.
  await open(admin, '/agent-platform/models/capacity');
  await expect(
    admin.getByRole('tab', { name: /^GPU (pools|capacity)$/ }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(admin.getByRole('article').first()).toBeVisible();
});
