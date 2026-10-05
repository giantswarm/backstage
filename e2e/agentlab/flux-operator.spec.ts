import { expect, open, test } from './fixtures';

/**
 * The Flux UI on the Flux Operator's own objects. The lab's platform chart
 * installs Flux through the operator: one FluxInstance, `flux`, in the
 * release namespace, next to which the operator keeps a FluxReport of the
 * same name. Both are listed, and the FluxInstance's details panel shows its
 * distribution and the report.
 */

test('the Flux list shows the FluxInstance and its FluxReport', async ({
  admin,
}) => {
  await open(admin, '/flux/list');
  test.skip(
    await admin
      .getByText(/not found/i)
      .first()
      .isVisible(),
    'this lab portal has no Flux page',
  );

  const instanceRow = admin
    .getByRole('row')
    .filter({ hasText: 'FluxInstance' })
    .filter({ hasText: 'flux' });
  await expect(instanceRow.first()).toBeVisible({ timeout: 60_000 });
  await expect(
    admin.getByRole('row').filter({ hasText: 'FluxReport' }).first(),
  ).toBeVisible();

  await instanceRow.first().getByRole('link', { name: 'flux' }).click();

  await expect(admin.getByText('This FluxInstance')).toBeVisible();
  await expect(admin.getByText('Flux Version').first()).toBeVisible();
  await expect(
    admin.getByRole('heading', { name: 'FluxReport' }),
  ).toBeVisible();
});

test('the Flux tree has the FluxInstance as a root', async ({ admin }) => {
  await open(admin, '/flux/tree');
  test.skip(
    await admin
      .getByText(/not found/i)
      .first()
      .isVisible(),
    'this lab portal has no Flux page',
  );

  // The instance's own inventory holds the Flux controllers only, which the
  // default Flux view hides, so the node stands alone.
  await expect(
    admin.getByRole('link', { name: 'flux', exact: true }).first(),
  ).toBeVisible({ timeout: 60_000 });
});
