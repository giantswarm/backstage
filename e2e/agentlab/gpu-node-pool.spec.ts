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
import {
  dropPersistedQueriesOnNextLoad,
  installPersistedQueryDrop,
  KSERVE_POOL_BACKEND,
  L4_POOL_PRESETS,
  NO_SIZE,
  poolFitAnswer,
  stubModelManagerTools,
  ToolRefusal,
} from './model-manager.fixture';

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
      await route.fallback();
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
/**
 * A page load within the plugin's cache window would take the lab's real
 * MCPServer list and clusters from the persisted react-query cache and never
 * ask the stub: arm a one-shot drop of that cache for the next navigation
 * (`model-manager.fixture.ts`).
 */
async function dropPersistedQueries(page: Page): Promise<void> {
  await installPersistedQueryDrop(page);
  await dropPersistedQueriesOnNextLoad(page);
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
  await dropPersistedQueries(page);
  const calls = await stubClusterManager(page, options);
  await open(page, '/agent-platform/models/capacity');

  // The header's button; a lab without a serving layer offers it once more
  // in the page's empty state.
  await page
    .getByRole('button', { name: 'Add GPU node pool' })
    .first()
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
  test('Deploy closes into the lifecycle panel: the row reads creating, then ready · 0 nodes; the steps turn done and end in Serve your first model, whose link opens the Serve dialog on the pool with model-manager’s presets and fit verdict', async ({
    page,
  }) => {
    // The backend the pool registers with model-manager, as the lab lacks it:
    // the kserve backend, its presets and the fit verdict, over muster like
    // everything else the Serve dialog asks — so the hand-off lands on a
    // dialog that can serve, not on "no serving backend can load a model".
    const modelManager = await stubModelManagerTools(page, {
      list_backends: { backends: [KSERVE_POOL_BACKEND] },
      list_presets: { presets: L4_POOL_PRESETS },
      list_models: { models: [] },
      check_fit: poolFitAnswer,
      load_model: new ToolRefusal('unexpected: nothing was to be served'),
    });
    const { dialog, calls } = await reachReview(page, {
      servers: ['model-manager'],
    });
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

    // The hand-off: Serve your first model opens the Serving page's dialog on
    // this pool, the presets model-manager publishes for the cluster offered
    // and check_fit's verdict before the button — all through muster as the
    // person, nothing composed in the browser.
    await page
      .getByTestId('pool-lifecycle')
      .getByRole('link', { name: 'Serve your first model' })
      .click();
    await expect(page).toHaveURL(/\/agent-platform\/models\/serving/);
    const serveDialog = page.getByRole('dialog', { name: 'Serve model' });
    await expect(serveDialog).toBeVisible({ timeout: 30_000 });
    await expect(serveDialog.getByTestId('serve-target')).toHaveText(
      `On GPU pool gpu-e2e of cluster wc1 (${lab.installation})`,
    );
    await expect(
      serveDialog.getByRole('button', { name: /Preset/ }),
      'the first preset model-manager publishes is chosen',
    ).toHaveText(/Qwen3 4B Instruct/);
    await expect(
      serveDialog.getByTestId('serve-fit-verdict'),
      'check_fit judged the preset against the pool',
    ).toContainText('Fits — the node comes as g6.xlarge');
    expect(modelManager.callsOf('check_fit')).toEqual([
      {
        name: 'x_model-manager_check_fit',
        arguments: { model: 'qwen3-4b-instruct' },
      },
    ]);
    await snapshot(page, 'gpu-pool-serve-first-model');
    await serveDialog.getByRole('button', { name: 'Cancel' }).click();
    // Without a preset on the form there is no serve intent: nothing was loaded.
    expect(modelManager.callsOf('load_model')).toEqual([]);
    await modelManager.unroute();
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

/**
 * The serve intent (giantswarm/backstage#2437): the preset chosen under **I want
 * to serve** is served once the serving stack is ready. The lifecycle panel ends
 * in **Serving <preset>**; when cluster-manager's readiness settles (read
 * SETTLED_READ) the portal calls `check_fit`, then `load_model {backend: kserve,
 * model: <preset>}` as the person — once — and the served model's own steps
 * show beneath until it answers; a reload keeps the step and its state; Remove
 * clears the intent; a refused fit shows model-manager's reason with **Serve
 * another model**; a load model-manager threw on offers **Try serving again**
 * and the dialog with the preset preselected. cluster-manager and model-manager
 * stubbed at the browser as above; the lab's muster appears to list
 * model-manager too (`servers`), and the stubbed inventory advances one stage per
 * read once the load was accepted (the shapes of model-manager 0.24.0).
 */
const SERVE_INTENTS_KEY = 'gs-agent-platform-serve-intents';
const ENDPOINT_8B = 'https://models.lab.example/model-serving/qwen3-8b-fp8';

/** `check_fit` on the pool for the 8B preset once 2xlarge is among the sizes: it fits. */
const FIT_8B_OK = {
  model: 'qwen3-8b-fp8',
  backend: 'kserve',
  fits: true,
  instanceType: 'g6.2xlarge',
  budgetSource: 'pool-scale-from-zero',
  cached: false,
  cacheSource: 'index',
  weightsBytes: 9_000_000_000,
  overheadBytes: 4_000_000_000,
  requiredBytes: 13_000_000_000,
};

const T8 = {
  created: '2026-09-17T06:59:00Z',
  nominated: '2026-09-17T06:59:35Z',
  bound: '2026-09-17T07:03:02Z',
  downloading: '2026-09-17T07:03:22Z',
  downloaded: '2026-09-17T07:04:34Z',
  pulled: '2026-09-17T07:08:34Z',
  loaded: '2026-09-17T07:09:40Z',
  ready: '2026-09-17T07:09:45Z',
};

type ServeStep = Record<string, unknown>;
const pendingStep = (name: string): ServeStep => ({ name, state: 'pending' });
const doneStep = (
  name: string,
  since: string,
  finishedAt: string,
  extra: ServeStep = {},
): ServeStep => ({ name, state: 'done', since, finishedAt, ...extra });

/** `load_model`'s answer for the 8B preset: the LLMInferenceService composed, the first step under way. */
const LOAD_8B = {
  name: 'qwen3-8b-fp8',
  backend: 'kserve',
  loaded: false,
  running: {
    resource: 'qwen3-8b-fp8',
    kind: 'LLMInferenceService',
    status: 'Pending',
    reason: 'WaitingForPod',
    message: 'waiting for the predictor pod',
    phase: 'scheduling',
    steps: [
      {
        name: 'scheduling',
        state: 'inProgress',
        since: T8.created,
        reason: 'WaitingForPod',
        message: 'waiting for the predictor pod',
      },
      ...[
        'nodeStarting',
        'downloadingWeights',
        'pullingImage',
        'loading',
        'routing',
        'ready',
      ].map(pendingStep),
    ],
  },
  fit: FIT_8B_OK,
};

/** The served 8B model of `list_models` at one stage of its timeline. */
function served8b(running: Record<string, unknown>) {
  return {
    models: [
      {
        name: 'Qwen/Qwen3-8B-FP8',
        backend: 'kserve',
        sizeBytes: 9_000_000_000,
        format: 'vLLM',
        downloaded: false,
        path: 'qwen3-8b-fp8',
        preset: 'qwen3-8b-fp8',
        loaded: true,
        running: {
          name: 'Qwen/Qwen3-8B-FP8',
          backend: 'kserve',
          resource: 'qwen3-8b-fp8',
          kind: 'LLMInferenceService',
          preset: 'qwen3-8b-fp8',
          gpus: 1,
          managedBy: 'model-manager',
          ...running,
        },
      },
    ],
  };
}

/** The inventory read by read after the load: scheduling, the weights downloading, ready. */
const STAGES_8B = [
  served8b({
    status: 'Pending',
    reason: 'WaitingForPod',
    message: 'waiting for the predictor pod',
    phase: 'scheduling',
    steps: LOAD_8B.running.steps,
  }),
  served8b({
    status: 'Pending',
    reason: 'DownloadingWeights',
    message:
      'DownloadingWeights storage-initializer downloading the weights into the cache claim',
    phase: 'downloadingWeights',
    steps: [
      doneStep('scheduling', T8.created, T8.nominated),
      doneStep('nodeStarting', T8.nominated, T8.bound),
      {
        name: 'downloadingWeights',
        state: 'inProgress',
        since: T8.downloading,
        reason: 'DownloadingWeights',
        message:
          'storage-initializer downloading the weights into the cache claim',
        bytesCompleted: 3_000_000_000,
        bytesTotal: 9_000_000_000,
      },
      ...['pullingImage', 'loading', 'routing', 'ready'].map(pendingStep),
    ],
  }),
  served8b({
    status: 'Ready',
    endpoint: ENDPOINT_8B,
    phase: 'ready',
    steps: [
      doneStep('scheduling', T8.created, T8.nominated),
      doneStep('nodeStarting', T8.nominated, T8.bound),
      doneStep('downloadingWeights', T8.downloading, T8.downloaded, {
        bytesTotal: 9_000_000_000,
        cached: false,
      }),
      doneStep('pullingImage', T8.downloaded, T8.pulled),
      doneStep('loading', T8.pulled, T8.loaded),
      doneStep('routing', T8.loaded, T8.ready),
      doneStep('ready', T8.ready, T8.ready),
    ],
  }),
];

type IntentStubOptions = {
  /** `check_fit`'s answer for the intent; the default is the fixture's, which refuses the 8B preset. */
  fit?: Record<string, unknown>;
  /** `load_model` calls model-manager refuses before one is accepted. */
  loadFailures?: number;
};

/**
 * model-manager at the browser for the intent: the kserve backend the pool
 * registers, its presets, `check_fit`, a `load_model` that flips the inventory
 * to the served 8B model, and an inventory that advances one stage per read.
 */
async function stageServeIntent(page: Page, options: IntentStubOptions = {}) {
  let loads = 0;
  let served = false;
  let reads = 0;
  return stubModelManagerTools(page, {
    list_backends: { backends: [KSERVE_POOL_BACKEND] },
    list_presets: { presets: L4_POOL_PRESETS },
    list_models: () => {
      if (!served) {
        return { models: [] };
      }
      reads += 1;
      return STAGES_8B[Math.min(reads, STAGES_8B.length) - 1];
    },
    check_fit: options.fit ? () => options.fit : poolFitAnswer,
    load_model: () => {
      loads += 1;
      if (loads <= (options.loadFailures ?? 0)) {
        return new ToolRefusal(
          'backend_error: the kserve backend did not answer: context deadline exceeded',
        );
      }
      served = true;
      return LOAD_8B;
    },
  });
}

/** Reach the form with model-manager listed, choose the 8B preset (2xlarge is its size), Review and Deploy. */
async function deployWithPreset(page: Page) {
  const { dialog, calls } = await reachForm(page, {
    servers: ['model-manager'],
  });
  await dialog.getByRole('button', { name: /I want to serve/ }).click();
  await page.getByRole('option', { name: /Qwen3 8B FP8/ }).click();
  await expect
    .poll(() => dryRuns(calls).at(-1)?.arguments.sizes)
    .toEqual(['2xlarge']);
  await dialog.getByRole('button', { name: 'Review' }).click();
  await expect(dialog.getByTestId('pool-fit-review')).toBeVisible({
    timeout: 30_000,
  });
  await expect(dialog.getByTestId('chosen-sizes')).toContainText(
    'I want to serve: Qwen3 8B FP8 (Qwen/Qwen3-8B-FP8)',
  );
  await dialog.getByRole('button', { name: /^Deploy/ }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  const panel = page.getByTestId('pool-lifecycle');
  await expect(panel).toContainText('Pool wc1-gpu-e2e');
  return { panel, calls };
}

const storedIntents = (page: Page) =>
  page.evaluate(key => window.localStorage.getItem(key), SERVE_INTENTS_KEY);

/** After a reload the panel is closed; the row's chevron opens it again. */
async function reopenPanel(page: Page) {
  await page
    .getByRole('row', { name: /wc1-gpu-e2e/ })
    .getByRole('button', { name: 'Show lifecycle of pool wc1-gpu-e2e' })
    .click({ timeout: 60_000 });
  return page.getByTestId('pool-lifecycle');
}

test.describe('models: GPU node pool serve intent — the preset chosen on the form is served once the stack is ready (cluster-manager and model-manager stubbed)', () => {
  test('Deploy with a preset ends in Serving <preset>: check_fit and load_model once as the person when the stack is ready, the model’s steps beneath until it answers; a reload keeps the step; Remove clears the intent', async ({
    page,
  }) => {
    const modelManager = await stageServeIntent(page, { fit: FIT_8B_OK });
    const { panel } = await deployWithPreset(page);

    await expect(panel).toContainText('serving Qwen3 8B FP8');
    const serve = panel.locator('[data-step="serve"]');
    await expect(serve).toContainText('Serving Qwen3 8B FP8');
    await expect(serve).toHaveAttribute('data-state', 'pending');
    await expect(serve).toContainText('once the steps above are done');
    await expect(
      panel.getByRole('link', { name: 'Serve your first model' }),
    ).toHaveCount(0);
    expect(modelManager.callsOf('load_model')).toEqual([]);
    await snapshot(page, 'gpu-pool-serve-intent-pending');

    // A reload during the wait: the intent is read back from the browser and
    // the step is there as it was.
    await page.reload();
    const reopened = await reopenPanel(page);
    await expect(reopened.locator('[data-step="serve"]')).toContainText(
      'Serving Qwen3 8B FP8',
    );

    // The stack settles: check_fit, then load_model — once, as the person, on
    // the kserve backend.
    await expect
      .poll(() => modelManager.callsOf('load_model').length, {
        timeout: 90_000,
      })
      .toBe(1);
    expect(modelManager.callsOf('check_fit')).toEqual([
      {
        name: 'x_model-manager_check_fit',
        arguments: { model: 'qwen3-8b-fp8', backend: 'kserve' },
      },
    ]);
    expect(modelManager.callsOf('load_model')[0].arguments).toEqual({
      model: 'qwen3-8b-fp8',
      backend: 'kserve',
    });

    // The served model's own steps beneath the pool's, then done once it answers.
    const serving = reopened.locator('[data-step="serve"]');
    await expect(serving).toHaveAttribute('data-state', 'inProgress', {
      timeout: 30_000,
    });
    await expect(serving.locator('[data-step="scheduling"]')).toBeVisible({
      timeout: 30_000,
    });
    await snapshot(page, 'gpu-pool-serve-intent-on-its-way');
    await expect(serving).toHaveAttribute('data-state', 'done', {
      timeout: 60_000,
    });
    await expect(serving).toContainText(
      `qwen3-8b-fp8 answers at ${ENDPOINT_8B}`,
    );
    await expect(serving.locator('[data-step="ready"]')).toHaveAttribute(
      'data-state',
      'done',
    );
    await expect(
      serving.getByRole('link', { name: 'Serve another model' }),
    ).toBeVisible();
    await snapshot(page, 'gpu-pool-serve-intent-done');
    expect(modelManager.callsOf('load_model')).toHaveLength(1);

    // Reloaded once more: done stays done, nothing is loaded again.
    await page.reload();
    const again = await reopenPanel(page);
    await expect(again.locator('[data-step="serve"]')).toHaveAttribute(
      'data-state',
      'done',
      { timeout: 30_000 },
    );
    await page.waitForTimeout(3_000);
    expect(modelManager.callsOf('load_model')).toHaveLength(1);
    const stored = (await storedIntents(page)) ?? '';
    expect(stored).toContain('"preset":"qwen3-8b-fp8"');
    expect(stored).toContain('"kind":"served"');

    // Remove clears the intent.
    await page
      .getByRole('row', { name: /wc1-gpu-e2e/ })
      .getByRole('button', { name: 'Remove pool wc1-gpu-e2e' })
      .click();
    const remove = page.getByRole('dialog');
    await remove.getByLabel(/Type wc1-gpu-e2e to confirm/).fill('wc1-gpu-e2e');
    await remove.getByRole('button', { name: 'Remove pool' }).click();
    await expect(remove).toBeHidden({ timeout: 30_000 });
    await expect
      .poll(async () => (await storedIntents(page)) ?? '')
      .not.toContain('qwen3-8b-fp8');
    await modelManager.unroute();
  });

  test('a preset the pool as deployed cannot host: check_fit’s reason verbatim as the dialog words it, load_model never called, Serve another model opens the dialog on the pool', async ({
    page,
  }) => {
    const modelManager = await stageServeIntent(page);
    const { panel } = await deployWithPreset(page);

    const serve = panel.locator('[data-step="serve"]');
    await expect(serve).toHaveAttribute('data-state', 'failed', {
      timeout: 90_000,
    });
    await expect(serve).toContainText(
      `Cannot be served on this pool: ${NO_SIZE}`,
    );
    expect(modelManager.callsOf('check_fit')).toHaveLength(1);
    expect(modelManager.callsOf('load_model')).toEqual([]);
    await expect(
      panel.getByRole('button', { name: 'Try serving again' }),
    ).toHaveCount(0);
    await snapshot(page, 'gpu-pool-serve-intent-refused');

    await serve.getByRole('link', { name: 'Serve another model' }).click();
    await expect(page).toHaveURL(/\/agent-platform\/models\/serving/);
    const serveDialog = page.getByRole('dialog', { name: 'Serve model' });
    await expect(serveDialog).toBeVisible({ timeout: 30_000 });
    await expect(serveDialog.getByTestId('serve-target')).toHaveText(
      `On GPU pool gpu-e2e of cluster wc1 (${lab.installation})`,
    );
    await expect(
      serveDialog.getByRole('button', { name: /Preset/ }),
      'another model: the dialog starts from the first preset',
    ).toHaveText(/Qwen3 4B Instruct/);
    await serveDialog.getByRole('button', { name: 'Cancel' }).click();
    await modelManager.unroute();
  });

  test('a load model-manager threw on: the message, the dialog with the preset preselected, Try serving again loads once more', async ({
    page,
  }) => {
    const modelManager = await stageServeIntent(page, {
      fit: FIT_8B_OK,
      loadFailures: 1,
    });
    const { panel } = await deployWithPreset(page);

    const serve = panel.locator('[data-step="serve"]');
    await expect(serve).toHaveAttribute('data-state', 'failed', {
      timeout: 90_000,
    });
    await expect(serve).toContainText(
      'model-manager refused: backend_error: the kserve backend did not answer',
    );
    expect(modelManager.callsOf('load_model')).toHaveLength(1);
    await snapshot(page, 'gpu-pool-serve-intent-failed');

    // The way out carries the preset: the Serve dialog on the pool preselects it.
    const link = serve.getByRole('link', {
      name: 'Serve Qwen3 8B FP8 in the dialog',
    });
    expect(await link.getAttribute('href')).toContain('preset=qwen3-8b-fp8');
    await link.click();
    const serveDialog = page.getByRole('dialog', { name: 'Serve model' });
    await expect(serveDialog).toBeVisible({ timeout: 30_000 });
    await expect(
      serveDialog.getByRole('button', { name: /Preset/ }),
      'the preset the pool was deployed to serve is preselected',
    ).toHaveText(/Qwen3 8B FP8/);
    await expect(serveDialog.getByTestId('serve-fit-verdict')).toContainText(
      'Fits — the node comes as g6.2xlarge',
    );
    await snapshot(page, 'gpu-pool-serve-dialog-preselected');
    await serveDialog.getByRole('button', { name: 'Cancel' }).click();

    // Back on the pool: Try serving again asks model-manager once more, and
    // the second load is accepted.
    await open(page, '/agent-platform/models/capacity');
    const reopened = await reopenPanel(page);
    await reopened.getByRole('button', { name: 'Try serving again' }).click();
    await expect
      .poll(() => modelManager.callsOf('load_model').length, {
        timeout: 30_000,
      })
      .toBe(2);
    await expect(reopened.locator('[data-step="serve"]')).toHaveAttribute(
      'data-state',
      'inProgress',
      { timeout: 30_000 },
    );
    await modelManager.unroute();
  });
});

const deletes = (calls: RecordedCall[]) =>
  calls.filter(call => call.name === 'x_cluster-manager_delete_node_pool');

/** Sign in, stub cluster-manager with `gpu-e2e` settled on wc1, open the page and the Remove confirm with the name typed. */
async function reachRemove(page: Page, options: StubOptions = {}) {
  await signIn(page, lab.users.admin);
  await dropPersistedQueries(page);
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
