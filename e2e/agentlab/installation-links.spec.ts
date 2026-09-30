import { expect, test } from './fixtures';
import { lab } from './lab';

/**
 * The Installation column of the Deployments table links to the
 * installation's catalog page where the portal has an Installations page
 * (giantswarm/roadmap#3830), and stays plain text where it has none, as in a
 * customer portal. The default lab enables no Installations page; set
 * AGENTLAB_INSTALLATIONS_PAGE=1 against a lab whose Backstage enables
 * `page:gs/installations` and lists the installation as a catalog Resource.
 */
const INSTALLATIONS_PAGE = Boolean(process.env.AGENTLAB_INSTALLATIONS_PAGE);

test('the Deployments table names the installation of each deployment', async ({
  admin,
}) => {
  await admin.goto('/deployments');

  // valkey is rendered by the agent-platform umbrella chart: always there.
  const row = admin.locator('tbody tr', { hasText: 'valkey' }).first();
  await expect(row, 'the deployments table lists valkey').toBeVisible({
    timeout: 60_000,
  });
  const cell = row.getByRole('cell', { name: lab.installation, exact: true });
  await expect(cell, 'the row names its installation').toBeVisible();

  if (INSTALLATIONS_PAGE) {
    await expect(
      cell.getByRole('link', { name: lab.installation }),
      'the name links to the installation catalog page',
    ).toHaveAttribute('href', `/catalog/default/resource/${lab.installation}`);
  } else {
    await expect(
      cell.getByRole('link'),
      'without an Installations page the name is plain text',
    ).toHaveCount(0);
  }
});
