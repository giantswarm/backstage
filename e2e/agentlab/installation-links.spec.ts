import type { Locator, Page, Response } from '@playwright/test';
import { expect, open, test } from './fixtures';
import { lab } from './lab';

/**
 * The Installation column of the Deployments table links to the
 * installation's catalog page where the catalog has the installation's
 * entity (a `Resource` of type `installation` in `default`), and stays plain
 * text where it has none (giantswarm/roadmap#3830).
 *
 * The lab's catalog has no installation entities, so each test stages the
 * catalog's answer to the one query the links share at the browser: once with
 * the lab's installation, once as the lab answers it, empty. The rest of the
 * page is the lab's.
 */
const INSTALLATION_NAMES = '**/api/catalog/entities?*';

const isInstallationNamesQuery = (url: string) => {
  const decoded = decodeURIComponent(url);
  return (
    decoded.includes('/api/catalog/entities?') &&
    decoded.includes('spec.type=installation') &&
    decoded.includes('fields=metadata.name')
  );
};

const installationEntity = (name: string) => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Resource',
  metadata: { name, namespace: 'default' },
  spec: { type: 'installation', owner: 'group:default/platform-admins' },
});

async function stageInstallationNames(admin: Page, names: string[]) {
  await admin.route(INSTALLATION_NAMES, async route => {
    if (!isInstallationNamesQuery(route.request().url())) {
      await route.fallback();
      return;
    }
    await route.fulfill({ json: names.map(installationEntity) });
  });
}

/** The Installation cell of the valkey row of the Deployments table. */
async function valkeyInstallationCell(admin: Page): Promise<Locator> {
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
  return cell;
}

test.describe('installation links', () => {
  test.afterEach(async ({ admin }) => {
    await admin.unroute(INSTALLATION_NAMES);
  });

  test('links the installation to its catalog page where the catalog has its entity', async ({
    admin,
  }) => {
    await stageInstallationNames(admin, [lab.installation]);
    await open(admin, '/deployments');

    const cell = await valkeyInstallationCell(admin);
    const link = cell.getByRole('link', { name: lab.installation });
    await expect(
      link,
      'the name links to the installation catalog page',
    ).toHaveAttribute('href', `/catalog/default/resource/${lab.installation}`);
    await expect(link, 'the link is underlined').toHaveCSS(
      'text-decoration-line',
      'underline',
    );

    // The entity itself is staged only in the shared query's answer, so the
    // catalog page it opens finds nothing to show: the address is the proof.
    await link.click();
    await expect(admin).toHaveURL(
      new RegExp(`/catalog/default/resource/${lab.installation}$`),
    );
  });

  test('shows the plain name where the catalog has no entity for it', async ({
    admin,
  }) => {
    await stageInstallationNames(admin, []);
    const answered = admin.waitForResponse((response: Response) =>
      isInstallationNamesQuery(response.url()),
    );
    await open(admin, '/deployments');

    const cell = await valkeyInstallationCell(admin);
    // Without a link before the answer too: wait for the catalog's answer,
    // and give the page a moment to render it, before checking the steady
    // state.
    await answered;
    await admin.waitForTimeout(1_000);
    await expect(
      cell.getByRole('link'),
      'without a catalog entity the name is plain text',
    ).toHaveCount(0);
  });
});
