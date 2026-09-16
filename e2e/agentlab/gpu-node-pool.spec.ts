import type { Page } from '@playwright/test';

import { expect, open, signIn, test } from './fixtures';
import { lab } from './lab';

/**
 * GPU node pools on the Models pages, against a lab whose agent-platform chart
 * carries cluster-manager (giantswarm/agent-platform#316, chart 4.26.0 with
 * `components.cluster-manager.enabled: true`). The suite is skipped with the
 * reason until AGENTLAB_CLUSTER_MANAGER=1 says the lab has it.
 *
 * The lab's kind cluster does not serve the Cluster API (`cluster.x-k8s.io`),
 * and cluster-manager 0.4.1+ says so: `list_clusters` answers no clusters and
 * a note, and every write refuses naming the cluster and the group. That is
 * the truth these tests pin — the portal shows the note, not an error, and
 * the refusal verbatim. The composed review, Deploy and Commit against a real
 * Cluster are the epic's first proof (giantswarm/giantswarm#37714).
 */
const CLUSTER_API_NOTE =
  'the Cluster API (cluster.x-k8s.io) is not served on this installation';

/**
 * Answer the portal's `list_clusters` with one cluster the lab does not have,
 * so the dialog lets the person reach Review — every other tool call goes
 * through to muster and cluster-manager untouched.
 */
async function offerAbsentCluster(page: Page, name: string): Promise<void> {
  await page.route('**/api/muster/call**', async route => {
    const body = route.request().postDataJSON() as { name?: string };
    if (body?.name !== 'x_cluster-manager_list_clusters') {
      await route.continue();
      return;
    }
    await route.fulfill({
      json: {
        clusters: [
          {
            name,
            namespace: 'org-lab',
            organization: 'lab',
            releaseVersion: '',
            ownCluster: false,
            gpuOperator: { status: 'unknown' },
            serving: { status: 'unknown' },
            poolReleases: [],
            commitTarget: null,
          },
        ],
        clusterApi: {
          group: 'cluster.x-k8s.io',
          version: 'v1beta1',
          state: 'served',
        },
      },
    });
  });
}

test.describe('models: GPU node pools', () => {
  test.skip(
    !process.env.AGENTLAB_CLUSTER_MANAGER,
    'needs a lab with cluster-manager registered in muster (agent-platform#316); set AGENTLAB_CLUSTER_MANAGER=1',
  );

  test('the GPU capacity page lists no pools and says the Cluster API is not served', async ({
    page,
  }) => {
    await signIn(page, lab.users.admin);
    await open(page, '/agent-platform/models/capacity');

    const panel = page.getByText('GPU node pools', { exact: true });
    await expect(panel).toBeVisible();
    await expect(page.getByText('No GPU node pools yet.')).toBeVisible();
    const note = page.getByTestId('cluster-api-note');
    await expect(note).toBeVisible({ timeout: 60_000 });
    await expect(note).toContainText(
      `${lab.installation}: ${CLUSTER_API_NOTE}`,
    );
    await expect(
      page.getByText('Node pools could not be read for some installations'),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /^Remove pool/ }),
    ).toHaveCount(0);
  });

  test('Add GPU node pool offers no cluster and shows the note', async ({
    page,
  }) => {
    await signIn(page, lab.users.admin);
    await open(page, '/agent-platform/models/capacity');

    await page.getByRole('button', { name: 'Add GPU node pool' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Add GPU node pool')).toBeVisible();

    await expect(
      dialog.getByRole('button', { name: /^No clusters/ }),
    ).toBeVisible({ timeout: 60_000 });
    await expect(dialog.getByTestId('cluster-api-note')).toContainText(
      CLUSTER_API_NOTE,
    );
    await expect(dialog.getByText('Clusters could not be read')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Review' })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
  });

  test('Review is refused by cluster-manager naming the cluster and the Cluster API', async ({
    page,
  }) => {
    await signIn(page, lab.users.admin);
    await offerAbsentCluster(page, 'nosuchcluster');
    await open(page, '/agent-platform/models/capacity');

    await page.getByRole('button', { name: 'Add GPU node pool' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /^Pick a cluster/ }).click();
    await page.getByRole('option', { name: /nosuchcluster/ }).click();
    await expect(dialog.getByTestId('cluster-marks')).toContainText(
      'Commit target: none',
    );
    await dialog.getByLabel(/Pool name/).fill('gpu-e2e');
    await dialog.getByRole('button', { name: 'Review' }).click();

    await expect(dialog.getByText('cluster-manager refused')).toBeVisible({
      timeout: 60_000,
    });
    await expect(
      dialog.getByText(`cluster nosuchcluster not found: ${CLUSTER_API_NOTE}`),
    ).toBeVisible();
    await expect(dialog.getByTestId('node-pool-review')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: /Commit/ })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
  });
});
