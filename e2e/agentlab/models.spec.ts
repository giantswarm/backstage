import { expect, open, test } from './fixtures';
import { lab } from './lab';
import { modelManagerUnavailable } from './model-manager.fixture';

/**
 * Models in the agent shell: the installation's `ModelConfig`s read through
 * the Kubernetes proxy with the person's token, as Customize's Models tab
 * (the lab always provisions `default-model-config`, its `aiModel`, so the
 * table has a row to show), and Model hosting's tabs under it.
 */

test('Customize · Models lists the lab default ModelConfig and offers Connect a model', async ({
  admin,
}) => {
  // Read first: it loads a page of its own to read the portal's tokens.
  const noServingLayer = await modelManagerUnavailable(admin);
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
  // The way into Model hosting, where the installation has a serving layer:
  // a lab without model-manager has none, and the card is left out.
  const hosting = admin.getByRole('link', { name: 'Model hosting' });
  if (noServingLayer) {
    await expect(
      hosting,
      'no serving layer: no Model hosting card',
    ).toHaveCount(0);
  } else {
    await expect(hosting).toHaveAttribute(
      'href',
      '/agent-platform/models/serving',
    );
  }
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

test('a model’s page sits under Customize in tabs, says why in Technical details, and its old paths redirect', async ({
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
  const modelPath = `/customize/models/${lab.installation}/${namespace}/default-model-config`;

  // Overview, the model's own address: its facts in the one column, none
  // beside the content, then Technical details. Used by counts the agents
  // that run on it once they are read.
  await expect(admin.getByRole('tab')).toHaveText([
    'Overview',
    'Usage',
    /^Used by \(\d+\)$/,
  ]);
  await expect(
    admin
      .getByRole('region', { name: 'Model details', exact: true })
      .getByText('Model ID', { exact: true }),
  ).toBeVisible();
  await expect(admin.getByRole('main').getByRole('complementary')).toHaveCount(
    0,
  );
  // The lab's model works, so nothing says it is not accepted.
  await expect(
    admin.getByRole('main').getByText('Ready', { exact: true }).first(),
  ).toBeVisible();
  await expect(
    admin.getByRole('link', { name: 'Show conditions', exact: true }),
  ).toHaveCount(0);

  // The conditions behind the status, folded in place at Overview's foot as
  // on the agent page. Once the read settles on Ready the fold-out is closed
  // (it opens on arrival only for a model that is not accepted); the
  // assertions retry until then, so a page drawn from the cache first cannot
  // race the click.
  const technical = admin.getByRole('button', {
    name: 'Technical details',
    exact: true,
  });
  await expect(technical).toHaveAttribute('aria-expanded', 'false');
  await technical.click();
  await expect(technical).toHaveAttribute('aria-expanded', 'true');
  await expect(
    admin.getByRole('heading', { level: 4, name: /^Accepted/ }),
  ).toBeVisible();

  await admin.getByRole('tab', { name: 'Usage', exact: true }).click();
  await expect(admin).toHaveURL(new RegExp(`${modelPath}/usage$`));

  await admin.getByRole('tab', { name: /^Used by/ }).click();
  await expect(admin).toHaveURL(new RegExp(`${modelPath}/used-by$`));
  await expect(
    admin
      .getByRole('grid', { name: 'Agents using this model', exact: true })
      .or(admin.getByText('No agent runs on this model yet.', { exact: true })),
  ).toBeVisible();

  // The former Details tab's address lands on Overview, where its Technical
  // details went.
  await open(admin, `${modelPath}/details`);
  await expect(admin).toHaveURL(detail);
  await expect(
    admin.getByRole('tab', { name: 'Overview', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');

  // The address the page used to have still lands on it, on Overview.
  await open(
    admin,
    `/agent-platform/models/${lab.installation}/${namespace}/default-model-config`,
  );
  await expect(admin).toHaveURL(detail);
  await expect(
    admin.getByRole('tab', { name: 'Overview', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
});

test('Model hosting’s Running models and GPU tabs render for the installation', async ({
  admin,
}) => {
  const unavailable = await modelManagerUnavailable(admin);
  test.skip(!!unavailable, unavailable);
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
