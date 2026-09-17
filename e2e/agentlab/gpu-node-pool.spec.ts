import type { Page } from '@playwright/test';

import { expect, open, signIn, test } from './fixtures';
import {
  stubClusterManager,
  type RecordedCall,
  type StubOptions,
} from './gpu-node-pool.fixture';
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
      dialog.getByText(
        `cluster org-lab/nosuchcluster not found: ${CLUSTER_API_NOTE}`,
      ),
    ).toBeVisible();
    await expect(dialog.getByTestId('node-pool-review')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: /Commit/ })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
  });
});

/**
 * The review's **What this pool can serve** (giantswarm/backstage#2413):
 * cluster-manager's `sizes`, `presetFit` and `warnings` before Deploy, and a
 * Deploy cut short (`partial`) continued from the dialog.
 *
 * **cluster-manager's answers are stubbed at the browser** (`gpu-node-pool.fixture.ts`):
 * the lab has no cluster-manager — no Cluster API on a kind cluster — so the
 * lab's MCPServer list gains a `cluster-manager` entry and the dialog's muster
 * calls are answered in cluster-manager 0.7.7's shapes. Everything else — the
 * sign-in, the page, the muster session — is real; nothing is written.
 */
const PERSISTER_KEY = 'agent-platform-react-query-cache';
const DROP_FLAG = 'e2e-drop-persisted-queries';

/**
 * A page load within the plugin's cache window would take the lab's real
 * MCPServer list and clusters from the persisted react-query cache and never
 * ask the stub: arm a one-shot drop of that cache for the next navigation
 * (the pattern of serving-state.spec.ts).
 */
async function dropPersistedQueriesOnNextLoad(page: Page): Promise<void> {
  await page.addInitScript(
    ([key, flag]) => {
      if (window.sessionStorage.getItem(flag)) {
        window.sessionStorage.removeItem(flag);
        window.localStorage.removeItem(key);
      }
    },
    [PERSISTER_KEY, DROP_FLAG] as const,
  );
  await page.evaluate(
    flag => window.sessionStorage.setItem(flag, '1'),
    DROP_FLAG,
  );
}

/** Full-page screenshots when `AGENTLAB_E2E_SCREENSHOTS=<dir>` is set — the PR's evidence. */
async function snapshot(page: Page, name: string): Promise<void> {
  const dir = process.env.AGENTLAB_E2E_SCREENSHOTS;
  if (dir) {
    await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
  }
}

/** Sign in, stub cluster-manager, open the dialog and reach the review of `gpu-e2e` on wc1. */
async function reachReview(page: Page, options: StubOptions = {}) {
  await signIn(page, lab.users.admin);
  await dropPersistedQueriesOnNextLoad(page);
  const calls = await stubClusterManager(page, options);
  await open(page, '/agent-platform/models/capacity');

  await page
    .getByRole('button', { name: 'Add GPU node pool' })
    .click({ timeout: 60_000 });
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /^Pick a cluster/ }).click();
  await page.getByRole('option', { name: /wc1/ }).click();
  await dialog.getByLabel(/Pool name/).fill('gpu-e2e');
  await dialog.getByRole('button', { name: 'Review' }).click();
  await expect(dialog.getByTestId('pool-fit-review')).toBeVisible({
    timeout: 60_000,
  });
  return { dialog, calls };
}

const dryRuns = (calls: RecordedCall[]) =>
  calls.filter(
    call =>
      call.name === 'x_cluster-manager_create_node_pool' &&
      call.arguments.dryRun === true,
  );
const applies = (calls: RecordedCall[]) =>
  calls.filter(
    call =>
      call.name === 'x_cluster-manager_create_node_pool' &&
      !call.arguments.dryRun,
  );

test.describe('models: Add GPU node pool review — what the pool can serve (cluster-manager stubbed)', () => {
  test('the review shows the g6 shapes, the presets each size hosts, and re-judges when sizes change', async ({
    page,
  }) => {
    const { dialog, calls } = await reachReview(page);
    const picker = dialog.getByTestId('sizes-picker');
    const fit = dialog.getByTestId('preset-fit');

    // The first dry run, with the chart's defaults: every shape, every preset.
    await expect(picker).toContainText(
      'g6.xlarge — 3 vCPU / 11.9 GiB usable, 1 × 24 GiB GPU',
    );
    await expect(picker).toContainText(
      'g6.2xlarge — 6.5 vCPU / 26.9 GiB usable',
    );
    await expect(fit).toContainText('qwen3-4b-instruct');
    await expect(fit).toContainText(
      '4 vCPU / 12Gi, 1 GPU, 9.6 GiB of GPU memory',
    );
    await expect(fit.getByText('✔ 2xlarge')).toHaveCount(2);
    // The seven 128 GB presets: a GPU-memory reason, no warning.
    await expect(fit).toContainText('devstral-small-2');
    await expect(fit).toContainText(
      '✘ needs 57.6 GiB of GPU memory across 1 GPU(s); a g6 GPU has 24 GiB',
    );
    await expect(fit.getByText(/✘ needs .* GiB of GPU memory/)).toHaveCount(7);
    await expect(dialog.getByTestId('fit-warnings')).toHaveCount(0);
    await expect(dialog.getByTestId('deploy-blocked')).toHaveCount(0);
    await snapshot(page, 'gpu-pool-fit-review-defaults');

    // Sizes [xlarge]: the two L4 presets fit no size — the warnings name 2xlarge.
    await picker.getByRole('checkbox', { name: /g6\.4xlarge/ }).uncheck();
    await picker.getByRole('checkbox', { name: /g6\.2xlarge/ }).uncheck();
    const warnings = dialog.getByTestId('fit-warnings');
    await expect(warnings).toBeVisible({ timeout: 30_000 });
    await expect(warnings).toContainText(
      '2 presets fit no size of this pool — Deploy is not blocked',
    );
    await expect(warnings).toContainText(
      "serving preset qwen3-4b-instruct fits no size of pool gpu-e2e: requests 4 vCPU / 12Gi; xlarge leaves a predictor 3 vCPU / 11.9 GiB after the node's kubelet reservations and daemonsets — 2xlarge (8 vCPU / 32 GiB) would host it",
    );
    await expect(warnings).toContainText(
      'serving preset qwen3-8b-fp8 fits no size',
    );
    await expect(fit.getByText('✔ 2xlarge')).toHaveCount(0);
    await expect(fit.getByText(/✘ needs .* GiB of GPU memory/)).toHaveCount(7);
    await expect(dialog.getByRole('button', { name: /^Deploy/ })).toBeEnabled();
    expect(dryRuns(calls).at(-1)?.arguments.sizes).toEqual(['xlarge']);
    await snapshot(page, 'gpu-pool-fit-review-xlarge-warnings');

    // The warning's own fix: Add 2xlarge — the warnings go.
    await warnings.getByRole('button', { name: 'Add 2xlarge' }).click();
    await expect(dialog.getByTestId('fit-warnings')).toHaveCount(0, {
      timeout: 30_000,
    });
    await expect(
      picker.getByRole('checkbox', { name: /g6\.2xlarge/ }),
    ).toBeChecked();

    // Sizes [2xlarge]: both L4 presets ✔ g6.2xlarge.
    await picker.getByRole('checkbox', { name: /g6\.xlarge/ }).uncheck();
    await expect
      .poll(() => dryRuns(calls).at(-1)?.arguments.sizes)
      .toEqual(['2xlarge']);
    await expect(fit.getByText('✔ 2xlarge')).toHaveCount(2);
    await expect(fit.getByText('g6.2xlarge')).toHaveCount(2);
    await snapshot(page, 'gpu-pool-fit-review-2xlarge');

    // Deploy sends the sizes as reviewed.
    await dialog.getByRole('button', { name: /^Deploy/ }).click();
    await expect(
      dialog.getByText('Pool wc1-gpu-e2e applied as you'),
    ).toBeVisible({ timeout: 30_000 });
    expect(applies(calls).at(-1)?.arguments).toMatchObject({
      cluster: 'wc1',
      name: 'gpu-e2e',
      accelerator: 'nvidia-l4',
      sizes: ['2xlarge'],
      mode: 'apply',
    });
    await dialog.getByRole('button', { name: 'Close' }).click();
  });

  test('the preset the person wants to serve blocks Deploy when no size hosts it; Add the size unblocks', async ({
    page,
  }) => {
    const { dialog } = await reachReview(page);
    const picker = dialog.getByTestId('sizes-picker');
    await picker.getByRole('checkbox', { name: /g6\.4xlarge/ }).uncheck();
    await picker.getByRole('checkbox', { name: /g6\.2xlarge/ }).uncheck();
    await expect(dialog.getByTestId('fit-warnings')).toBeVisible({
      timeout: 30_000,
    });

    await dialog.getByRole('button', { name: /I want to serve/ }).click();
    await page.getByRole('option', { name: 'qwen3-4b-instruct' }).click();

    const blocked = dialog.getByTestId('deploy-blocked');
    await expect(blocked).toContainText(
      'Deploy is blocked: qwen3-4b-instruct fits no size of this pool',
    );
    await expect(blocked).toContainText(
      '2xlarge (8 vCPU / 32 GiB) would host it',
    );
    await expect(
      dialog.getByRole('button', { name: /^Deploy/ }),
    ).toBeDisabled();
    // The other preset's warning stands out, does not block, and the chosen one is not repeated there.
    const warnings = dialog.getByTestId('fit-warnings');
    await expect(warnings).toContainText(
      '1 preset fits no size of this pool — Deploy is not blocked',
    );
    await expect(warnings).toContainText('qwen3-8b-fp8');
    await expect(warnings).not.toContainText('qwen3-4b-instruct');
    // The picker marks the sizes that host the chosen preset.
    await expect(
      picker.getByRole('checkbox', { name: /g6\.xlarge/ }),
    ).toHaveAccessibleName(/does not host qwen3-4b-instruct/);
    await expect(
      picker.getByRole('checkbox', { name: /g6\.2xlarge/ }),
    ).toHaveAccessibleName(/hosts qwen3-4b-instruct/);
    await snapshot(page, 'gpu-pool-fit-review-blocked');

    await blocked.getByRole('button', { name: 'Add 2xlarge' }).click();
    await expect(dialog.getByTestId('deploy-blocked')).toHaveCount(0, {
      timeout: 30_000,
    });
    await expect(dialog.getByRole('button', { name: /^Deploy/ })).toBeEnabled();

    // A 128 GB preset: the GPU-memory reason blocks, and no size would help.
    await dialog.getByRole('button', { name: /I want to serve/ }).click();
    await page.getByRole('option', { name: 'qwen3-coder-next' }).click();
    await expect(blocked).toContainText(
      'needs 96 GiB of GPU memory across 1 GPU(s); a g6 GPU has 24 GiB',
    );
    await expect(blocked.getByRole('button', { name: /^Add/ })).toHaveCount(0);
    await expect(
      dialog.getByRole('button', { name: /^Deploy/ }),
    ).toBeDisabled();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
  });

  test('a cluster without presets shows the note instead of an empty table', async ({
    page,
  }) => {
    const { dialog } = await reachReview(page, { presets: false });
    const note = dialog.getByTestId('preset-fit-note');
    await expect(note).toContainText('No presets to judge yet');
    await expect(note).toContainText(
      "no serving preset is published on wc1 yet — the slice release publishes them once it is ready; a dryRun re-run then says which of the pool's sizes host each",
    );
    await expect(dialog.getByTestId('preset-fit')).toHaveCount(0);
    await expect(
      dialog.getByRole('button', { name: /I want to serve/ }),
    ).toHaveCount(0);
    await expect(dialog.getByTestId('sizes-picker')).toContainText(
      'g6.xlarge — 3 vCPU / 11.9 GiB usable',
    );
    await expect(dialog.getByRole('button', { name: /^Deploy/ })).toBeEnabled();
    await snapshot(page, 'gpu-pool-fit-review-no-presets');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
  });

  test('a Deploy cut short lists the pending objects and Continue re-runs the same call', async ({
    page,
  }) => {
    const { dialog, calls } = await reachReview(page, { partialApplies: 1 });
    await dialog.getByRole('button', { name: /^Deploy/ }).click();

    const partial = dialog.getByTestId('partial-write');
    await expect(partial).toContainText(
      'Deploy was cut short: 3 of 7 objects are pending',
    );
    await expect(partial).toContainText(
      're-run with the same arguments, the pending objects are written first',
    );
    const pending = dialog.getByTestId('pending-objects');
    await expect(pending).toContainText(
      'ConfigMap agent-platform/model-backend-kserve: pending',
    );
    await expect(pending).toContainText(
      'HelmRelease org-lab/wc1-gpu-operator: pending',
    );
    await expect(dialog.getByRole('button', { name: /^Deploy/ })).toHaveCount(
      0,
    );
    await snapshot(page, 'gpu-pool-deploy-partial');

    await partial.getByRole('button', { name: 'Continue' }).click();
    await expect(
      dialog.getByText('Pool wc1-gpu-e2e applied as you'),
    ).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByTestId('partial-write')).toHaveCount(0);
    const [first, second] = applies(calls);
    expect(second.arguments).toEqual(first.arguments);
    expect(first.arguments).toMatchObject({ mode: 'apply', name: 'gpu-e2e' });
    await dialog.getByRole('button', { name: 'Close' }).click();
  });
});
