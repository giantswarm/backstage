import { expect, open, test } from './fixtures';

/**
 * The Models tab reads the installation's `ModelConfig`s through the
 * Kubernetes proxy with the person's token. The lab always provisions
 * `default-model-config` (its `aiModel`), so the table has a row to show.
 */

test('Model configs lists the lab default ModelConfig and offers Add model', async ({
  admin,
}) => {
  await open(admin, '/agent-platform/models');
  await expect(admin).toHaveURL(/\/agent-platform\/models\/configs$/);
  await expect(admin.getByRole('button', { name: 'Add model' })).toBeVisible();
  await expect(
    admin.getByText('default-model-config').first(),
    'the ModelConfig the lab provisions is listed',
  ).toBeVisible();
});

test('Serving and GPU capacity render for the installation', async ({
  admin,
}) => {
  await open(admin, '/agent-platform/models/serving');
  await expect(admin.getByRole('tab', { name: 'Serving' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(admin.getByRole('article').first()).toBeVisible();

  await open(admin, '/agent-platform/models/capacity');
  await expect(
    admin.getByRole('tab', { name: 'GPU capacity' }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(admin.getByRole('article').first()).toBeVisible();
});
