import type { Page, Route } from '@playwright/test';

import { expect, open, signIn, test } from './fixtures';
import { lab } from './lab';
import { installPersistedQueryDrop } from './model-manager.fixture';

/**
 * Create cluster on the Clusters page, through the lab's real cluster-manager
 * over muster as the signed-in person (giantswarm/backstage#2624).
 *
 * The lab's kind cluster serves neither Release CRs nor the Cluster API, so
 * two reads are answered at the browser: `list_releases` (one active AWS
 * release) and the installation's Organizations (one, `lab`). Every
 * `create_cluster` call — both modes' dry runs — goes to the lab's
 * cluster-manager untouched, and its refusal is what these tests pin: shown
 * verbatim as the reason each mode cannot be chosen, nothing written.
 */
const RELEASES = {
  providers: ['aws'],
  releases: [
    {
      name: 'aws-33.1.0',
      provider: 'aws',
      version: '33.1.0',
      state: 'active',
      kubernetesVersion: '1.33.4',
      releaseChart: {
        url: 'oci://gsoci.azurecr.io/charts/giantswarm/release-aws',
        version: '33.1.0',
        published: true,
      },
      offered: true,
    },
  ],
};

const ORGANIZATIONS = 'security.giantswarm.io';

async function stageReleasesAndOrganizations(page: Page): Promise<void> {
  await installPersistedQueryDrop(page);
  await page.route('**/api/muster/call**', async route => {
    const body = route.request().postDataJSON() as { name?: string };
    if (body?.name !== 'x_cluster-manager_list_releases') {
      await route.fallback();
      return;
    }
    await route.fulfill({ json: RELEASES });
  });
  await page.route('**/api/kubernetes/proxy/**', async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/\/$/, '');
    if (
      request.method() !== 'GET' ||
      request.headers()['backstage-kubernetes-cluster'] !== lab.installation ||
      !path.includes(`/apis/${ORGANIZATIONS}`)
    ) {
      await route.fallback();
      return;
    }
    if (path.endsWith(`/apis/${ORGANIZATIONS}`)) {
      await route.fulfill({
        json: {
          kind: 'APIGroup',
          apiVersion: 'v1',
          name: ORGANIZATIONS,
          versions: [
            { groupVersion: `${ORGANIZATIONS}/v1alpha1`, version: 'v1alpha1' },
          ],
          preferredVersion: {
            groupVersion: `${ORGANIZATIONS}/v1alpha1`,
            version: 'v1alpha1',
          },
        },
      });
      return;
    }
    if (path.endsWith(`/apis/${ORGANIZATIONS}/v1alpha1`)) {
      await route.fulfill({
        json: {
          kind: 'APIResourceList',
          apiVersion: 'v1',
          groupVersion: `${ORGANIZATIONS}/v1alpha1`,
          resources: [
            {
              name: 'organizations',
              singularName: 'organization',
              namespaced: false,
              kind: 'Organization',
              verbs: ['get', 'list', 'watch'],
            },
          ],
        },
      });
      return;
    }
    await route.fulfill({
      json: {
        apiVersion: `${ORGANIZATIONS}/v1alpha1`,
        kind: 'OrganizationList',
        metadata: { resourceVersion: '1' },
        items: [
          {
            apiVersion: `${ORGANIZATIONS}/v1alpha1`,
            kind: 'Organization',
            metadata: { name: 'lab' },
            spec: {},
          },
        ],
      },
    });
  });
}

test.describe('clusters: Create cluster through cluster-manager', () => {
  test.skip(
    !process.env.AGENTLAB_CLUSTER_MANAGER,
    'needs a lab with cluster-manager registered in muster (agent-platform#316); set AGENTLAB_CLUSTER_MANAGER=1',
  );

  test('reviews both modes and shows cluster-manager’s refusal as the reason', async ({
    page,
  }) => {
    await signIn(page, lab.users.admin);
    await stageReleasesAndOrganizations(page);
    await open(page, '/clusters');

    const create = page.getByRole('button', { name: 'Create cluster' });
    await expect(create).toBeVisible({ timeout: 60_000 });
    await create.click();
    const dialog = page.getByRole('dialog');

    await expect(
      dialog.getByRole('button', { name: /33\.1\.0 · Kubernetes 1\.33\.4/ }),
    ).toBeVisible({ timeout: 60_000 });
    await dialog.getByRole('button', { name: /Pick an organization/ }).click();
    await page.getByRole('option', { name: 'lab' }).click();

    const name = dialog.getByLabel(/^Name/);
    await name.fill('1bad');
    await expect(
      dialog.getByText(/starting with a letter/).first(),
    ).toBeVisible();
    await name.fill('e2e1');

    await dialog.getByRole('button', { name: 'Review' }).click();
    await expect(dialog.getByTestId('cluster-review')).toBeVisible({
      timeout: 60_000,
    });
    // Nothing can be written on a kind cluster: Deploy says why in
    // cluster-manager's words, and nothing is preselected.
    await expect(dialog.getByTestId('mode-notes')).toContainText(
      'Deploy is not possible:',
    );
    await expect(dialog.getByRole('radio', { name: /^Deploy/ })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Deploy' })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
  });
});
