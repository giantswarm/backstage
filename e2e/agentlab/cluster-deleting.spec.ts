import type { Page } from '@playwright/test';
import { expect, open, test } from './fixtures';
import { lab } from './lab';

/**
 * The cluster details page of a cluster being deleted (roadmap#3837). The lab
 * has no Cluster API, so the clusters come from `cluster-deleting.fixture.yaml`
 * (see its header): `wc-deleting` is held in deletion by a finalizer after its
 * App went, `wc-live` is a cluster whose control plane does not exist.
 */
test.skip(
  process.env.AGENTLAB_CLUSTER_FIXTURE !== '1',
  'needs cluster-deleting.fixture.yaml applied to the lab (AGENTLAB_CLUSTER_FIXTURE=1)',
);

const clusterPath = (name: string) =>
  `/clusters/${lab.installation}/org-lab/${name}`;

/**
 * Waits until the About card has read what it could: the Kubernetes version,
 * the provider location and the AWS account come from the control plane and
 * the AWSCluster, which the fixture does not have, so all three read n/a
 * beside the service priority. The error panel collects the failed reads
 * after a short debounce, so the panel is checked a moment later.
 */
async function settled(page: Page) {
  await expect(page.getByText('n/a', { exact: true })).toHaveCount(4);
  await page.waitForTimeout(1_000);
}

/** The heading of the portal's error panel, one or more failed fetches. */
const errorPanel =
  /Errors when trying to fetch resources from|Something went wrong/;

test('a cluster being deleted says so and reports no missing resources', async ({
  admin,
}, testInfo) => {
  await open(admin, clusterPath('wc-deleting'));

  await expect(admin.getByText('This cluster is being deleted')).toBeVisible();
  await expect(admin.getByText('e2e fixture (wc-deleting)')).toBeVisible();
  await settled(admin);
  await expect(admin.getByText(errorPanel)).toHaveCount(0);

  await admin.screenshot({
    path: testInfo.outputPath('wc-deleting.png'),
    fullPage: true,
  });
});

test('a cluster that is not being deleted still reports a missing control plane', async ({
  admin,
}, testInfo) => {
  await open(admin, clusterPath('wc-live'));

  await expect(admin.getByText('e2e fixture (wc-live)')).toBeVisible();
  await settled(admin);
  await expect(admin.getByText(errorPanel)).toBeVisible();
  await expect(admin.getByText('This cluster is being deleted')).toHaveCount(0);

  await admin.screenshot({
    path: testInfo.outputPath('wc-live.png'),
    fullPage: true,
  });
});
