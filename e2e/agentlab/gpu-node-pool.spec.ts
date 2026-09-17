import type { Locator, Page } from '@playwright/test';

import { expect, open, signIn, test } from './fixtures';
import {
  PRESET_SOURCE,
  PRICE_AS_OF,
  PRICE_SOURCE,
  SETTLED_READ,
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

    // The form's own dry run — for the sizes and prices — meets the refusal; no Review needed.
    await expect(dialog.getByText('cluster-manager refused')).toBeVisible({
      timeout: 60_000,
    });
    await expect(
      dialog.getByText(
        `cluster org-lab/nosuchcluster not found: ${CLUSTER_API_NOTE}`,
      ),
    ).toBeVisible();
    await expect(dialog.getByTestId('node-size-picker')).toHaveCount(0);
    await expect(dialog.getByTestId('node-pool-review')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: /Commit/ })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
  });
});

/**
 * **Node size** and **I want to serve** on the form (giantswarm/backstage#2424,
 * after #2413's review): cluster-manager's `sizes` with their prices,
 * `presetFit` with display names, models and origin, and `warnings`, read by
 * the form's own dry run before Review; the review showing the same choice;
 * and a Deploy cut short (`partial`) continued from the dialog.
 *
 * **cluster-manager's answers are stubbed at the browser** (`gpu-node-pool.fixture.ts`):
 * the lab has no cluster-manager — no Cluster API on a kind cluster — so the
 * lab's MCPServer list gains a `cluster-manager` entry and the dialog's muster
 * calls are answered in cluster-manager's shapes. Everything else — the
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

/** Toggle a size in the picker: the react-aria input is visually hidden, its label is what a person clicks. */
async function toggleSize(picker: Locator, size: RegExp): Promise<void> {
  const checkbox = picker.getByRole('checkbox', { name: size });
  const before = await checkbox.isChecked();
  await checkbox.locator('xpath=ancestor::label[1]').click();
  await expect(checkbox).toBeChecked({ checked: !before });
}

/**
 * Sign in, stub cluster-manager, open the dialog, pick wc1 — the form's own
 * dry run answers with the sizes to pick from before the pool is named — and
 * name the pool `gpu-e2e`.
 */
async function reachForm(page: Page, options: StubOptions = {}) {
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
  // The sizes, their prices and the presets are there before the pool is
  // named: the decision is made on the form, the name only labels the pool.
  await expect(dialog.getByTestId('node-size-picker')).toBeVisible({
    timeout: 60_000,
  });
  await expect(dialog.getByRole('button', { name: 'Review' })).toBeDisabled();
  await dialog.getByLabel(/Pool name/).fill('gpu-e2e');
  await expect(dialog.getByRole('button', { name: 'Review' })).toBeEnabled({
    timeout: 60_000,
  });
  return { dialog, calls };
}

/** …and Review, with the chart's default sizes as chosen. */
async function reachReview(page: Page, options: StubOptions = {}) {
  const reached = await reachForm(page, options);
  await reached.dialog.getByRole('button', { name: 'Review' }).click();
  await expect(reached.dialog.getByTestId('pool-fit-review')).toBeVisible({
    timeout: 60_000,
  });
  return reached;
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

test.describe('models: Add GPU node pool — node size, price and preset on the form (cluster-manager stubbed)', () => {
  test('the form offers the g6 sizes with usable resources, GPU memory and price, the cheapest as the from price; a change re-judges; the review shows the same choice and Deploy sends it', async ({
    page,
  }) => {
    const { dialog, calls } = await reachForm(page);
    const picker = dialog.getByTestId('sizes-picker');

    // The first dry run, with the chart's defaults: every size, priced, every one preselected.
    expect(dryRuns(calls)[0].arguments).not.toHaveProperty('sizes');
    await expect(picker).toContainText(
      'g6.xlarge — 3 vCPU / 11.9 GiB usable, 1 × 24 GiB GPU — $1.01/h',
    );
    await expect(picker).toContainText(
      'g6.2xlarge — 6.5 vCPU / 26.9 GiB usable, 1 × 24 GiB GPU — $1.22/h',
    );
    await expect(picker).toContainText(
      'g6.4xlarge — 14.5 vCPU / 58.4 GiB usable, 1 × 24 GiB GPU — $1.65/h',
    );
    for (const size of [/g6\.xlarge/, /g6\.2xlarge/, /g6\.4xlarge/]) {
      await expect(picker.getByRole('checkbox', { name: size })).toBeChecked();
    }
    await expect(dialog.getByTestId('price-summary')).toContainText(
      'from $1.01/h per node (g6.xlarge) — the pool scales to zero',
    );
    await expect(picker).toContainText(
      `Prices: ${PRICE_SOURCE}, as of ${PRICE_AS_OF}.`,
    );
    await expect(
      dialog.getByRole('button', { name: /I want to serve/ }),
    ).toBeVisible();
    await expect(dialog.getByTestId('fit-warnings')).toHaveCount(0);
    await expect(dialog.getByTestId('node-pool-review')).toHaveCount(0);
    await snapshot(page, 'gpu-pool-form-sizes-prices');

    // Sizes [xlarge]: the two L4 presets fit no size — the warnings name 2xlarge, on the form.
    await toggleSize(picker, /g6\.4xlarge/);
    await toggleSize(picker, /g6\.2xlarge/);
    const warnings = dialog.getByTestId('fit-warnings');
    await expect(warnings).toBeVisible({ timeout: 30_000 });
    await expect(warnings).toContainText(
      '2 presets fit no size of this pool — Deploy is not blocked',
    );
    await expect(warnings).toContainText(
      "serving preset qwen3-4b-instruct fits no size of pool gpu-e2e: requests 4 vCPU / 12Gi; xlarge leaves a predictor 3 vCPU / 11.9 GiB after the node's kubelet reservations and daemonsets — 2xlarge (8 vCPU / 32 GiB) would host it",
    );
    expect(dryRuns(calls).at(-1)?.arguments.sizes).toEqual(['xlarge']);
    await snapshot(page, 'gpu-pool-form-xlarge-warnings');

    // The warning's own fix: Add 2xlarge — the warnings go, the from price stays the cheapest.
    await warnings.getByRole('button', { name: 'Add 2xlarge' }).click();
    await expect(dialog.getByTestId('fit-warnings')).toHaveCount(0, {
      timeout: 30_000,
    });
    await expect(
      picker.getByRole('checkbox', { name: /g6\.2xlarge/ }),
    ).toBeChecked();
    await expect(dialog.getByTestId('price-summary')).toContainText(
      'from $1.01/h',
    );

    // Sizes [2xlarge]: the from price follows the choice.
    await toggleSize(picker, /g6\.xlarge/);
    await expect
      .poll(() => dryRuns(calls).at(-1)?.arguments.sizes)
      .toEqual(['2xlarge']);
    await expect(dialog.getByTestId('price-summary')).toContainText(
      'from $1.22/h per node (g6.2xlarge)',
    );

    // The review shows the same choice — the size with its price, no picker —
    // and the presets each size hosts by display name and model.
    await dialog.getByRole('button', { name: 'Review' }).click();
    await expect(dialog.getByTestId('pool-fit-review')).toBeVisible({
      timeout: 30_000,
    });
    const chosen = dialog.getByTestId('chosen-sizes');
    await expect(chosen).toContainText(
      'g6.2xlarge — 6.5 vCPU / 26.9 GiB usable, 1 × 24 GiB GPU — $1.22/h',
    );
    await expect(chosen).not.toContainText('g6.xlarge —');
    await expect(chosen).toContainText(
      'I want to serve: any preset — no preference',
    );
    const fit = dialog.getByTestId('preset-fit');
    await expect(fit).toContainText('Qwen3 4B Instruct');
    await expect(fit).toContainText('Qwen/Qwen3-4B-Instruct-2507');
    await expect(fit).toContainText(
      '4 vCPU / 12Gi, 1 GPU, 9.6 GiB of GPU memory',
    );
    await expect(fit.getByText('✔ 2xlarge')).toHaveCount(2);
    await expect(fit.getByText('g6.2xlarge — $1.22/h')).toHaveCount(2);
    // The seven 128 GB presets: a GPU-memory reason.
    await expect(fit).toContainText('Devstral Small 2');
    await expect(fit).toContainText(
      '✘ needs 57.6 GiB of GPU memory across 1 GPU(s); a g6 GPU has 24 GiB',
    );
    await expect(fit.getByText(/✘ needs .* GiB of GPU memory/)).toHaveCount(7);
    await expect(dialog.getByTestId('sizes-picker')).toHaveCount(0);
    await snapshot(page, 'gpu-pool-review-same-choice');

    // Deploy sends the sizes as chosen, and closes into the lifecycle panel.
    await dialog.getByRole('button', { name: /^Deploy/ }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    await expect(page.getByTestId('pool-lifecycle')).toContainText(
      'Pool wc1-gpu-e2e',
    );
    expect(applies(calls).at(-1)?.arguments).toMatchObject({
      cluster: 'wc1',
      name: 'gpu-e2e',
      accelerator: 'nvidia-l4',
      sizes: ['2xlarge'],
      mode: 'apply',
    });
  });

  test('choosing a preset on the form preselects the smallest size hosting it with its price and marks the others; a preset no chosen size hosts blocks Deploy with the reason, Add the size unblocks', async ({
    page,
  }) => {
    const { dialog, calls } = await reachForm(page);
    const picker = dialog.getByTestId('sizes-picker');

    await dialog.getByRole('button', { name: /I want to serve/ }).click();
    const option = page.getByRole('option', { name: /Qwen3 4B Instruct/ });
    await expect(option).toContainText('Qwen/Qwen3-4B-Instruct-2507');
    await option.click();

    // 2xlarge is the smallest size hosting it: chosen alone, the others marked.
    await expect
      .poll(() => dryRuns(calls).at(-1)?.arguments.sizes)
      .toEqual(['2xlarge']);
    await expect(
      picker.getByRole('checkbox', { name: /g6\.2xlarge/ }),
    ).toBeChecked();
    await expect(
      picker.getByRole('checkbox', { name: /g6\.xlarge/ }),
    ).not.toBeChecked();
    await expect(
      picker.getByRole('checkbox', { name: /g6\.4xlarge/ }),
    ).not.toBeChecked();
    await expect(
      picker.getByRole('checkbox', { name: /g6\.2xlarge/ }),
    ).toHaveAccessibleName(/hosts Qwen3 4B Instruct/);
    await expect(
      picker.getByRole('checkbox', { name: /g6\.xlarge/ }),
    ).toHaveAccessibleName(/does not host Qwen3 4B Instruct/);
    await expect(
      picker.getByRole('checkbox', { name: /g6\.4xlarge/ }),
    ).toHaveAccessibleName(/ · hosts Qwen3 4B Instruct/);
    await expect(dialog.getByTestId('price-summary')).toContainText(
      'from $1.22/h per node (g6.2xlarge)',
    );
    await expect(dialog.getByTestId('deploy-blocked')).toHaveCount(0);
    await expect(dialog.getByTestId('fit-warnings')).toHaveCount(0);
    await snapshot(page, 'gpu-pool-form-preset-picked');

    // Only xlarge: the preset fits no chosen size — Deploy is blocked with the
    // reason naming 2xlarge; the other L4 preset's warning stands out and does not block.
    await toggleSize(picker, /g6\.xlarge/);
    await toggleSize(picker, /g6\.2xlarge/);
    const blocked = dialog.getByTestId('deploy-blocked');
    await expect(blocked).toBeVisible({ timeout: 30_000 });
    await expect(blocked).toContainText(
      'Deploy is blocked: Qwen3 4B Instruct fits no size of this pool',
    );
    await expect(blocked).toContainText(
      '2xlarge (8 vCPU / 32 GiB) would host it',
    );
    const warnings = dialog.getByTestId('fit-warnings');
    await expect(warnings).toContainText(
      '1 preset fits no size of this pool — Deploy is not blocked',
    );
    await expect(warnings).toContainText('qwen3-8b-fp8');
    await expect(warnings).not.toContainText('qwen3-4b-instruct');
    await snapshot(page, 'gpu-pool-form-blocked');

    await blocked.getByRole('button', { name: 'Add 2xlarge' }).click();
    await expect(dialog.getByTestId('deploy-blocked')).toHaveCount(0, {
      timeout: 30_000,
    });

    // A 128 GB preset: the GPU-memory reason blocks and no size would help;
    // the review says so and Deploy is disabled. Back keeps the choice.
    await dialog.getByRole('button', { name: /I want to serve/ }).click();
    await page.getByRole('option', { name: /Qwen3 Coder Next/ }).click();
    await expect(blocked).toContainText(
      'needs 96 GiB of GPU memory across 1 GPU(s); a g6 GPU has 24 GiB',
    );
    await expect(blocked.getByRole('button', { name: /^Add/ })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Review' }).click();
    await expect(dialog.getByTestId('pool-fit-review')).toBeVisible({
      timeout: 30_000,
    });
    await expect(dialog.getByTestId('chosen-sizes')).toContainText(
      'I want to serve: Qwen3 Coder Next (Qwen/Qwen3-Coder-Next-FP8)',
    );
    await expect(dialog.getByTestId('deploy-blocked')).toContainText(
      'needs 96 GiB of GPU memory',
    );
    await expect(
      dialog.getByRole('button', { name: /^Deploy/ }),
    ).toBeDisabled();
    await snapshot(page, 'gpu-pool-review-blocked');
    await dialog.getByRole('button', { name: 'Back' }).click();
    await expect(
      picker.getByRole('checkbox', { name: /g6\.2xlarge/ }),
    ).toBeChecked();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
  });

  test('a cluster without a serving slice still offers the presets — the ones the chart ships', async ({
    page,
  }) => {
    const { dialog } = await reachForm(page, { presetOrigin: 'chart' });
    await expect(
      dialog.getByRole('button', { name: /I want to serve/ }),
    ).toBeVisible();
    await expect(dialog.getByTestId('node-size-picker')).toContainText(
      `Presets: ${PRESET_SOURCE.chart}.`,
    );
    await expect(dialog.getByTestId('preset-fit-note')).toHaveCount(0);

    await dialog.getByRole('button', { name: /I want to serve/ }).click();
    const option = page.getByRole('option', { name: /Qwen3 8B FP8/ });
    await expect(option).toContainText('Qwen/Qwen3-8B-FP8');
    await option.click();
    await expect(
      dialog
        .getByTestId('sizes-picker')
        .getByRole('checkbox', { name: /g6\.2xlarge/ }),
    ).toBeChecked();
    await expect(dialog.getByTestId('price-summary')).toContainText(
      'from $1.22/h per node (g6.2xlarge)',
    );
    await snapshot(page, 'gpu-pool-form-chart-presets');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
  });

  test('where nothing could be judged the form shows the note instead of a preset picker', async ({
    page,
  }) => {
    const { dialog } = await reachForm(page, { presets: false });
    const note = dialog.getByTestId('preset-fit-note');
    await expect(note).toContainText('No presets to judge yet');
    await expect(note).toContainText(
      "no serving preset is published on wc1 yet — the slice release publishes them once it is ready; a dryRun re-run then says which of the pool's sizes host each",
    );
    await expect(
      dialog.getByRole('button', { name: /I want to serve/ }),
    ).toHaveCount(0);
    await expect(dialog.getByTestId('sizes-picker')).toContainText(
      'g6.xlarge — 3 vCPU / 11.9 GiB usable, 1 × 24 GiB GPU — $1.01/h',
    );
    await snapshot(page, 'gpu-pool-form-no-presets');

    await dialog.getByRole('button', { name: 'Review' }).click();
    await expect(dialog.getByTestId('pool-fit-review')).toBeVisible({
      timeout: 30_000,
    });
    await expect(dialog.getByTestId('preset-fit')).toHaveCount(0);
    await expect(dialog.getByTestId('preset-fit-note')).toBeVisible();
    await expect(dialog.getByRole('button', { name: /^Deploy/ })).toBeEnabled();
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
    // The completed Deploy closes into the pool's lifecycle panel.
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    await expect(page.getByTestId('pool-lifecycle')).toContainText(
      'Pool wc1-gpu-e2e',
    );
    const [first, second] = applies(calls);
    expect(second.arguments).toEqual(first.arguments);
    expect(first.arguments).toMatchObject({ mode: 'apply', name: 'gpu-e2e' });
  });
});

const LIFECYCLE_STEPS = [
  'release',
  'karpenterPool',
  'gpuOperator',
  'serving',
  'backend',
  'serve',
];

const listReads = (calls: RecordedCall[]) =>
  calls.filter(call => call.name === 'x_cluster-manager_list_clusters').length;

test.describe('models: GPU node pool lifecycle after Deploy (cluster-manager stubbed)', () => {
  test('Deploy closes into the lifecycle panel: the row reads creating, then ready · 0 nodes; the steps turn done and end in Serve your first model', async ({
    page,
  }) => {
    const { dialog, calls } = await reachReview(page);
    await dialog.getByRole('button', { name: /^Deploy/ }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });

    const panel = page.getByTestId('pool-lifecycle');
    await expect(panel).toContainText('Pool wc1-gpu-e2e');
    await expect(panel.getByTestId('applied-objects')).toContainText(
      'HelmRelease wc1-gpu-e2e: created',
    );
    const row = page.getByRole('row', { name: /wc1-gpu-e2e/ });
    await expect(row).toContainText('creating', { timeout: 30_000 });
    await expect(panel.locator('[data-step="release"]')).toHaveAttribute(
      'data-state',
      /inProgress|done/,
    );
    await expect(panel.locator('[data-step="karpenterPool"]')).toContainText(
      'Karpenter pool ready',
    );
    await expect(panel.locator('[data-step="serve"]')).toHaveAttribute(
      'data-state',
      'pending',
    );
    await snapshot(page, 'gpu-pool-lifecycle-creating');

    await expect(row).toContainText('ready · 0 nodes', { timeout: 45_000 });
    await expect(row).not.toContainText('0 / 0');
    await expect(panel.locator('[data-step="karpenterPool"]')).toContainText(
      '0 nodes, launches on demand',
    );
    await expect(panel.locator('[data-step="gpuOperator"]')).toContainText(
      'starts with the first node',
      { timeout: 30_000 },
    );
    const serve = panel.getByRole('link', { name: 'Serve your first model' });
    await expect(serve).toBeVisible({ timeout: 45_000 });
    await expect(panel.locator('[data-step="backend"]')).toContainText(
      'agent-platform/model-backend-kserve',
    );
    for (const id of LIFECYCLE_STEPS) {
      await expect(panel.locator(`[data-step="${id}"]`)).toHaveAttribute(
        'data-state',
        'done',
      );
    }
    const href = (await serve.getAttribute('href')) ?? '';
    expect(href).toContain('/agent-platform/models/serving?');
    expect(href).toContain('serve=1');
    expect(href).toContain('cluster=wc1');
    expect(href).toContain('pool=gpu-e2e');
    await snapshot(page, 'gpu-pool-lifecycle-ready');

    // Polling: the lists were re-read every 10 s while the pool was unsettled
    // (the stub settles on read SETTLED_READ), and every 60 s from then on.
    const settledReads = listReads(calls);
    expect(settledReads).toBeGreaterThanOrEqual(SETTLED_READ);
    await page.waitForTimeout(15_000);
    expect(listReads(calls)).toBe(settledReads);

    // The panel closes, and the row's chevron opens it again.
    await panel
      .getByRole('button', { name: 'Close lifecycle of pool wc1-gpu-e2e' })
      .click();
    await expect(page.getByTestId('pool-lifecycle')).toHaveCount(0);
    await row
      .getByRole('button', { name: 'Show lifecycle of pool wc1-gpu-e2e' })
      .click();
    await expect(page.getByTestId('pool-lifecycle')).toContainText(
      'ready · 0 nodes',
    );
  });

  test('an installation on an older cluster-manager gets the panel with fewer steps from poolReleases and the components status, never an error', async ({
    page,
  }) => {
    const { dialog } = await reachReview(page, { lifecycle: 'legacy' });
    await dialog.getByRole('button', { name: /^Deploy/ }).click();

    const panel = page.getByTestId('pool-lifecycle');
    await expect(panel).toContainText('Pool wc1-gpu-e2e', { timeout: 30_000 });
    const row = page.getByRole('row', { name: /wc1-gpu-e2e/ });
    await expect(row).toContainText('creating', { timeout: 30_000 });
    await expect(row).toContainText('ready · 0 nodes', { timeout: 45_000 });
    await expect(panel.locator('[data-step="backend"]')).toHaveCount(0);
    await expect(panel.getByTestId('lifecycle-step')).toHaveCount(5);
    await expect(
      panel.getByRole('link', { name: 'Serve your first model' }),
    ).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});

const deletes = (calls: RecordedCall[]) =>
  calls.filter(call => call.name === 'x_cluster-manager_delete_node_pool');

/** Sign in, stub cluster-manager with `gpu-e2e` settled on wc1, open the page and the Remove confirm with the name typed. */
async function reachRemove(page: Page, options: StubOptions = {}) {
  await signIn(page, lab.users.admin);
  await dropPersistedQueriesOnNextLoad(page);
  const calls = await stubClusterManager(page, {
    existingPool: 'gpu-e2e',
    ...options,
  });
  await open(page, '/agent-platform/models/capacity');
  const row = page.getByRole('row', { name: /wc1-gpu-e2e/ });
  await expect(row).toContainText('ready · 0 nodes', { timeout: 60_000 });
  await row.getByRole('button', { name: 'Remove pool wc1-gpu-e2e' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/Type wc1-gpu-e2e to confirm/).fill('wc1-gpu-e2e');
  return { row, dialog, calls };
}

/** After an accepted Remove: the row reads removing… with the teardown in the panel, then the pool is gone. */
async function expectRemovingThenGone(page: Page, row: Locator) {
  const panel = page.getByTestId('pool-lifecycle');
  await expect(row).toContainText('removing…', { timeout: 30_000 });
  await expect(panel).toContainText('Pool wc1-gpu-e2e');
  const pool = panel.locator('[data-step="pool"]');
  await expect(pool).toHaveAttribute('data-state', 'inProgress');
  await expect(pool).toContainText('terminating');
  await expect(panel.locator('[data-step="slice"]')).toBeVisible();
  await expect(
    panel.getByRole('link', { name: 'Serve your first model' }),
  ).toHaveCount(0);
  await snapshot(page, 'gpu-pool-removing');

  await expect(row).toHaveCount(0, { timeout: 60_000 });
  await expect(panel).toContainText('removed');
  await expect(panel.getByTestId('pool-removed')).toBeVisible();
  for (const id of ['operator', 'backend', 'slice', 'pool']) {
    await expect(panel.locator(`[data-step="${id}"]`)).toHaveAttribute(
      'data-state',
      'done',
    );
  }
  await snapshot(page, 'gpu-pool-removed');
}

/**
 * Remove (giantswarm/backstage#2414, part 2): the row reads removing… with the
 * teardown until `list_node_pools` no longer lists the pool; a refusal is
 * rendered from cluster-manager 0.8.1's structured `refused` block with Check
 * again, Remove anyway a second choice; a Remove cut short is continued.
 * cluster-manager stubbed at the browser as above (the lab has none).
 */
test.describe('models: GPU node pool Remove — Removing until gone, the refusal explained, partial continued (cluster-manager stubbed)', () => {
  test('a refused Remove shows the nodes, the models to unload and the hint; Check again re-runs without force and closes into Removing…, then the pool is gone', async ({
    page,
  }) => {
    const { row, dialog, calls } = await reachRemove(page, {
      refusals: { count: 1, shape: 'structured' },
    });
    await dialog.getByRole('button', { name: 'Remove pool' }).click();

    const refused = dialog.getByTestId('remove-refused');
    await expect(refused).toContainText('the pool still runs 1 node', {
      timeout: 30_000,
    });
    await expect(refused.getByTestId('refused-nodes')).toContainText(
      'i-0a1b2c3d4e5f60001',
    );
    await expect(refused.getByTestId('refused-models')).toContainText(
      'Unload this model first',
    );
    await expect(
      refused.getByRole('link', { name: /qwen3-4b-instruct/ }),
    ).toHaveAttribute('href', /\/agent-platform\/models\/serving/);
    await expect(refused).toContainText(
      'Karpenter removes an empty node about 10 minutes after its last pod',
    );
    await expect(
      refused.getByRole('checkbox', { name: /Remove anyway/ }),
    ).not.toBeChecked();
    expect(deletes(calls)).toHaveLength(1);
    expect(deletes(calls)[0].arguments).not.toHaveProperty('force');
    await snapshot(page, 'gpu-pool-remove-refused');

    await refused.getByRole('button', { name: 'Check again' }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    expect(deletes(calls)).toHaveLength(2);
    expect(deletes(calls)[1].arguments).toMatchObject({
      mode: 'apply',
      cluster: 'wc1',
      name: 'gpu-e2e',
    });
    expect(deletes(calls)[1].arguments).not.toHaveProperty('force');
    await expectRemovingThenGone(page, row);
  });

  test('a Remove cut short lists the pending objects and Continue re-runs the same call, then Removing…', async ({
    page,
  }) => {
    const { row, dialog, calls } = await reachRemove(page, {
      partialDeletes: 1,
    });
    await dialog.getByRole('button', { name: 'Remove pool' }).click();

    const partial = dialog.getByTestId('partial-write');
    await expect(partial).toContainText(
      'Remove was cut short: 3 of 7 objects are pending',
      { timeout: 30_000 },
    );
    await expect(dialog.getByTestId('pending-objects')).toContainText(
      'HelmRelease org-lab/wc1-gpu-operator: pending',
    );
    await expect(
      dialog.getByRole('button', { name: 'Remove pool' }),
    ).toBeDisabled();
    await snapshot(page, 'gpu-pool-remove-partial');

    await partial.getByRole('button', { name: 'Continue' }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    const [first, second] = deletes(calls);
    expect(second.arguments).toEqual(first.arguments);
    await expect(row).toContainText('removing…', { timeout: 30_000 });
    await expect(page.getByTestId('pool-lifecycle')).toContainText(
      'terminating',
    );
  });

  test('an older cluster-manager without the refused block: the text as it is, Check again, no Remove anyway', async ({
    page,
  }) => {
    const { dialog, calls } = await reachRemove(page, {
      refusals: { count: 1, shape: 'text' },
    });
    await dialog.getByRole('button', { name: 'Remove pool' }).click();

    const refused = dialog.getByTestId('remove-refused');
    await expect(refused).toContainText(
      'node pool wc1-gpu-e2e still runs 1 node(s)',
      { timeout: 30_000 },
    );
    await expect(refused.getByTestId('refused-nodes')).toHaveCount(0);
    await expect(refused.getByRole('checkbox')).toHaveCount(0);
    await refused.getByRole('button', { name: 'Check again' }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    expect(deletes(calls)).toHaveLength(2);
  });
});
