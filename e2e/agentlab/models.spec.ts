import { expect, open, test } from './fixtures';
import { lab } from './lab';

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

test('a model’s page sits under Customize, says why in Technical details, and its old path redirects', async ({
  admin,
}) => {
  await open(admin, '/customize/models');
  await admin
    .getByRole('rowheader', { name: /^default-model-config/ })
    .getByRole('link')
    .click();
  const detail = new RegExp(
    `/customize/models/${lab.installation}/([^/]+)/default-model-config$`,
  );
  await expect(admin).toHaveURL(detail);
  const namespace = detail.exec(new URL(admin.url()).pathname)?.[1];

  // The conditions behind the status, folded in place as on the agent page:
  // open on arrival unless the controller accepted the model.
  const technical = admin.getByRole('button', {
    name: 'Technical details',
    exact: true,
  });
  await expect(technical).toBeVisible();
  if ((await technical.getAttribute('aria-expanded')) !== 'true') {
    await technical.click();
  }
  await expect(
    admin.getByRole('heading', { level: 4, name: /^Accepted/ }),
  ).toBeVisible();

  // The address the page used to have still lands on it.
  await open(
    admin,
    `/agent-platform/models/${lab.installation}/${namespace}/default-model-config`,
  );
  await expect(admin).toHaveURL(detail);
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
