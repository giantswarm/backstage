import { connectToMuster, expect, open, test } from './fixtures';
import { lab } from './lab';

/**
 * A connector's sign-in mode, as the shell names it: Customize's Connectors
 * table by its short label, the connector's page by the words the Add
 * connector wizard offers the mode under — the lab's OAuth fixture
 * (`auth.type: oauth`, its own authorization server) is the own-account mode
 * in both.
 */

test('Connectors: the table and the connector page name the fixture’s sign-in mode', async ({
  admin,
}) => {
  await open(
    admin,
    `/agent-platform/connectors?installation=${lab.installation}`,
  );
  await connectToMuster(admin, admin.getByRole('grid'));

  const row = admin.getByRole('row', { name: /^lab-oauth-fixture/ });
  await expect(
    row.getByRole('gridcell', { name: 'Your own account' }),
    'the Sign-in column names the fixture by its mode',
  ).toBeVisible();

  await row.getByRole('rowheader').click();
  await admin.getByRole('tab', { name: 'Details', exact: true }).click();
  await expect(
    admin
      .getByRole('region', { name: 'Connector details' })
      .getByText('Each person signs in with their own account', {
        exact: true,
      }),
    'the page names the same mode as the wizard offers it',
  ).toBeVisible({ timeout: 60_000 });
});
