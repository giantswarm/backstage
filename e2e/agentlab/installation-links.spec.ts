import { expect, test } from './fixtures';
import { lab } from './lab';

/**
 * The Installation column of the Deployments table links to the
 * installation's catalog page where the portal has an Installations page
 * (giantswarm/roadmap#3830), and stays plain text where it has none, as in a
 * customer portal. The default lab enables no Installations page; set
 * AGENTLAB_INSTALLATIONS_PAGE=1 against a lab whose Backstage enables
 * `page:gs/installations` and lists the installation as a catalog Resource
 * of type `installation`.
 */
const INSTALLATIONS_PAGE = Boolean(process.env.AGENTLAB_INSTALLATIONS_PAGE);

test('the Deployments table names the installation of each deployment', async ({
  admin,
}) => {
  await admin.goto('/deployments');

  const table = admin.locator('table').filter({
    has: admin.getByRole('columnheader', { name: 'Installation' }),
  });
  // valkey is rendered by the agent-platform umbrella chart: always there.
  const row = table.locator('tbody tr', { hasText: 'valkey' }).first();
  await expect(row, 'the deployments table lists valkey').toBeVisible({
    timeout: 60_000,
  });
  // In the lab the installation, its cluster and the namespace share one
  // name: the cell is picked by the column's header.
  const headers = await table.getByRole('columnheader').allTextContents();
  const column = headers.findIndex(header => header.trim() === 'Installation');
  expect(column, 'the table has an Installation column').toBeGreaterThan(-1);
  const cell = row.getByRole('cell').nth(column);
  await expect(cell, 'the row names its installation').toHaveText(
    lab.installation,
  );

  if (INSTALLATIONS_PAGE) {
    const link = cell.getByRole('link', { name: lab.installation });
    await expect(
      link,
      'the name links to the installation catalog page',
    ).toHaveAttribute('href', `/catalog/default/resource/${lab.installation}`);
    await link.click();
    await expect(admin).toHaveURL(
      new RegExp(`/catalog/default/resource/${lab.installation}$`),
    );
    await expect(
      admin.getByRole('heading', { level: 2, name: lab.installation }),
      'one click reaches the installation page',
    ).toBeVisible();
  } else {
    await expect(
      cell.getByRole('link'),
      'without an Installations page the name is plain text',
    ).toHaveCount(0);
  }
});
