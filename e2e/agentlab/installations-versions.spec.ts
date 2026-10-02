import { expect, open, test } from './fixtures';
import { lab } from './lab';

/**
 * The management cluster versions on the Installations page
 * (giantswarm/backstage#2704): the Kubernetes version and the Giant Swarm
 * release of each installation, read live through the portal's Kubernetes
 * proxy.
 *
 * The lab's catalog has no installation entities, so the spec adds the lab's
 * own installation to the catalog's answer: the row is the fixture, the
 * cells are the lab's. The kind cluster's API server answers `/version`; it
 * runs no Giant Swarm management cluster, so its release is "—".
 */
const INSTALLATION_ENTITY = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Resource',
  metadata: {
    name: lab.installation,
    namespace: 'default',
    labels: { 'giantswarm.io/provider': 'kind' },
  },
  spec: { type: 'installation', owner: 'group:default/platform-admins' },
};

test.describe('installations: management cluster versions', () => {
  test.beforeEach(async ({ admin }) => {
    await admin.route('**/api/catalog/entities/by-query**', async route => {
      const url = decodeURIComponent(route.request().url());
      if (!url.includes('spec.type=installation')) {
        await route.fallback();
        return;
      }
      const response = await route.fetch();
      const body = await response.json();
      const names = body.items.map(
        (entity: { metadata: { name: string } }) => entity.metadata.name,
      );
      if (!names.includes(lab.installation)) {
        body.items.push(INSTALLATION_ENTITY);
        body.totalItems = body.items.length;
      }
      await route.fulfill({ response, json: body });
    });
  });

  test.afterEach(async ({ admin }) => {
    await admin.unroute('**/api/catalog/entities/by-query**');
  });

  test('shows the Kubernetes version and the release of the installation', async ({
    admin,
  }) => {
    await open(admin, '/installations');
    await expect(
      admin.getByRole('columnheader', { name: 'Kubernetes version' }),
    ).toBeVisible({ timeout: 120_000 });
    await expect(
      admin.getByRole('columnheader', { name: 'Release' }),
    ).toBeVisible();

    const kubernetes = admin.getByTestId(
      `version-kubernetes-${lab.installation}`,
    );
    await expect(kubernetes).toHaveText(/^1\.\d+\.\d+/, { timeout: 120_000 });

    const release = admin.getByTestId(`version-release-${lab.installation}`);
    await expect(release).toBeVisible({ timeout: 120_000 });
    await expect(release).toHaveAttribute(
      'title',
      'The management cluster carries no Giant Swarm release',
    );
  });

  test('finds the installation by its Kubernetes version in the search', async ({
    admin,
  }) => {
    await open(admin, '/installations');
    const kubernetes = admin.getByTestId(
      `version-kubernetes-${lab.installation}`,
    );
    await expect(kubernetes).toHaveText(/^1\.\d+\.\d+/, { timeout: 120_000 });
    const minor = (await kubernetes.innerText()).trim().split('.', 2).join('.');

    const search = admin.getByPlaceholder('Filter');
    await search.fill(`${minor}.`);
    await expect(kubernetes).toBeVisible();
    await search.fill('0.0.0-no-such-version');
    await expect(kubernetes).toHaveCount(0);
  });
});
