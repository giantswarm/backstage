import { expect, open, signIn, test } from './fixtures';
import { lab } from './lab';

/**
 * Add GPU node pool on the Models pages, against a lab whose agent-platform
 * chart carries cluster-manager (giantswarm/agent-platform#316). Until that
 * chart is the lab's default the suite is skipped with the reason; set
 * AGENTLAB_CLUSTER_MANAGER=1 to run it against a lab that has it.
 */
test.describe('models: GPU node pools', () => {
  test.skip(
    !process.env.AGENTLAB_CLUSTER_MANAGER,
    'needs a lab with cluster-manager registered in muster (agent-platform#316); set AGENTLAB_CLUSTER_MANAGER=1',
  );

  test('the GPU capacity page offers Add GPU node pool and reviews a dry run', async ({
    page,
  }) => {
    await signIn(page, lab.users.admin);
    await open(page, '/agent-platform/models/capacity');

    await page.getByRole('button', { name: 'Add GPU node pool' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Add GPU node pool')).toBeVisible();

    await dialog.getByRole('button', { name: /^Pick a cluster/ }).click();
    await page.getByRole('option').first().click();
    await expect(dialog.getByTestId('cluster-marks')).toContainText(
      'GPU operator',
    );
    await dialog.getByLabel(/Pool name/).fill('gpu-e2e');
    await dialog.getByRole('button', { name: 'Review' }).click();

    await expect(dialog.getByTestId('node-pool-review')).toBeVisible({
      timeout: 60_000,
    });
    await expect(dialog.getByText(/gpu-node-pool chart/)).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Deploy' })).toBeEnabled();
    await expect(dialog.getByRole('button', { name: /Commit/ })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
  });
});
