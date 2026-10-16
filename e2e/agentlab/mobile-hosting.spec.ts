import type { Page } from '@playwright/test';
import {
  expect,
  expectNoHorizontalScroll,
  open,
  signIn,
  test,
} from './fixtures';
import { stubClusterManager } from './gpu-node-pool.fixture';
import { lab } from './lab';
import {
  dropPersistedQueriesOnNextLoad,
  installPersistedQueryDrop,
} from './model-manager.fixture';

/**
 * Model hosting on a phone (wave 3A, B12/B14/B16): the hosting header is one
 * button and a ⋯ menu, GPU pools and model cache claims are stacked rows, and
 * their destructive actions — Remove pool, Remove cache — live in each row's
 * ⋯ menu ("Actions for pool …" / "Actions for cache …") instead of the
 * desktop table's buttons (`gpu-node-pool.spec.ts`). cluster-manager stubbed
 * at the browser as there (the lab serves no Cluster API).
 */

async function openHosting(
  page: Page,
  options: Parameters<typeof stubClusterManager>[1],
  tab: 'capacity' | 'cache' = 'capacity',
) {
  await signIn(page, lab.users.admin);
  await installPersistedQueryDrop(page);
  await dropPersistedQueriesOnNextLoad(page);
  const calls = await stubClusterManager(page, options);
  await open(page, `/customize/models/hosting/${tab}`);
  return calls;
}

test.describe('models on a phone (cluster-manager stubbed)', () => {
  test.skip(
    !process.env.AGENTLAB_CLUSTER_MANAGER,
    'needs a lab with cluster-manager registered in muster; set AGENTLAB_CLUSTER_MANAGER=1',
  );

  test('a GPU pool is a stacked row whose ⋯ menu removes it', async ({
    page,
  }) => {
    const calls = await openHosting(page, { existingPool: 'gpu-e2e' });
    const pools = page.getByRole('list', { name: 'GPU node pools' });
    const row = pools.getByRole('listitem').filter({ hasText: 'wc1-gpu-e2e' });
    await expect(row).toContainText('ready · 0 nodes', { timeout: 60_000 });
    await expect(
      page.getByRole('button', { name: /^Remove pool/ }),
      'no Remove button on a phone row',
    ).toHaveCount(0);
    await expectNoHorizontalScroll(page, 'GPU capacity with a pool');

    const actions = row.getByRole('button', {
      name: 'Actions for pool wc1-gpu-e2e',
    });
    await expect(actions).toBeInViewport({ ratio: 1 });
    await actions.click();
    await page.getByRole('menuitem', { name: /Remove pool/ }).click();
    const dialog = page.getByRole('dialog', {
      name: 'Remove pool "wc1-gpu-e2e"?',
    });
    await dialog.getByLabel(/Type wc1-gpu-e2e to confirm/).fill('wc1-gpu-e2e');
    await expectNoHorizontalScroll(page, 'the Remove pool dialog');
    await dialog.getByRole('button', { name: 'Remove pool' }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    expect(
      calls.filter(call => call.name === 'x_cluster-manager_delete_node_pool'),
    ).toHaveLength(1);
    await expect(row).toContainText('removing…', { timeout: 30_000 });
    await expect(row).toHaveCount(0, { timeout: 60_000 });
  });

  test('a kept model cache claim is a stacked row whose ⋯ menu removes it', async ({
    page,
  }) => {
    // Model hosting's Model cache tab lists the claims.
    const calls = await openHosting(page, { keptCache: 'kept' }, 'cache');
    const card = page.getByTestId('model-cache-panel');
    const row = card.getByRole('listitem').filter({ hasText: 'hf-cache' });
    await expect(row).toContainText('$27.37/month', { timeout: 60_000 });
    await expect(
      card.getByRole('button', { name: /^Remove cache/ }),
      'no Remove button on a phone row',
    ).toHaveCount(0);
    await expectNoHorizontalScroll(page, 'Model cache with a kept claim');

    await row
      .getByRole('button', { name: /^Actions for cache hf-cache/ })
      .click();
    await page.getByRole('menuitem', { name: /Remove cache/ }).click();
    const confirm = page.getByRole('dialog', {
      name: /Remove the model cache hf-cache on wc1\?/,
    });
    await expect(confirm).toBeVisible();
    await confirm
      .getByRole('checkbox')
      .locator('xpath=ancestor::label[1]')
      .click();
    await confirm.getByRole('button', { name: 'Remove cache' }).click();
    await expect(confirm).toBeHidden({ timeout: 30_000 });
    expect(
      calls.filter(
        call => call.name === 'x_cluster-manager_remove_model_cache',
      ),
    ).toHaveLength(1);
  });
});

test('the hosting header is one button and a ⋯ menu on a phone', async ({
  admin,
}) => {
  for (const path of [
    '/customize/models/hosting',
    '/customize/models/hosting/capacity',
  ]) {
    await open(admin, path);
    await expect(admin.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoHorizontalScroll(admin, `${path} header`);
  }
});
