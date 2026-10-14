import type { Page } from '@playwright/test';
import { expect, open, test } from './fixtures';
import { lab } from './lab';
import {
  dropPersistedQueriesOnNextLoad,
  installPersistedQueryDrop,
  KSERVE_POOL_BACKEND,
  L4_POOL_PRESETS,
  NO_SIZE,
  POOL_FIT,
  poolFitAnswer,
  stubModelManagerTools,
  type ModelManagerStub,
} from './model-manager.fixture';

/**
 * Serve on a GPU pool through model-manager as the signed-in person
 * (giantswarm/backstage#2415, part 1; the reads on the same hop since
 * giantswarm/backstage#2294): Serve model — a page of its own
 * (`/agent-platform/models/serving/serve`) — lists the presets model-manager
 * publishes for the cluster, shows `check_fit`'s verdict before the button,
 * serves with one `load_model` over muster, and the object that comes back is
 * the `LLMInferenceService` model-manager composed — nothing is composed in
 * the browser.
 *
 * **model-manager's answers are stubbed at the browser**; everything else is
 * real (the sign-in, muster's `call` route, the page). The lab has no KServe
 * and no GPU pool, so the tool calls the Serving view and Serve model make over
 * muster — `list_backends`, `list_presets`, `list_models`, `check_fit`,
 * `load_model` — are answered here in the shapes model-manager 0.24.0
 * produces for a kserve backend a GPU pool registered. Nothing is written; the
 * stubbed load flips the stubbed inventory to the served model.
 */

/** `load_model`'s answer: the LLMInferenceService model-manager composed, the fit it judged by, the first step. */
const loaded = {
  name: 'qwen3-4b-instruct',
  backend: 'kserve',
  loaded: false,
  running: {
    resource: 'qwen3-4b-instruct',
    kind: 'LLMInferenceService',
    status: 'Pending',
    reason: 'WaitingForPod',
    message: 'waiting for the predictor pod',
    phase: 'scheduling',
    steps: [
      {
        name: 'scheduling',
        state: 'inProgress',
        since: '2026-09-17T06:59:00Z',
        reason: 'WaitingForPod',
        message: 'waiting for the predictor pod',
      },
      { name: 'nodeStarting', state: 'pending' },
      { name: 'downloadingWeights', state: 'pending' },
      { name: 'pullingImage', state: 'pending' },
      { name: 'loading', state: 'pending' },
      { name: 'routing', state: 'pending' },
      { name: 'ready', state: 'pending' },
    ],
  },
  fit: POOL_FIT['qwen3-4b-instruct'],
};

/** `list_models` once the load was accepted: the served model, its predictor pod awaited. */
const servedModels = {
  models: [
    {
      name: 'Qwen/Qwen3-4B-Instruct-2507',
      backend: 'kserve',
      sizeBytes: 8_060_000_000,
      format: 'vLLM',
      contextLength: 32768,
      downloaded: false,
      path: 'qwen3-4b-instruct',
      preset: 'qwen3-4b-instruct',
      loaded: true,
      running: {
        name: 'Qwen/Qwen3-4B-Instruct-2507',
        backend: 'kserve',
        status: 'Pending',
        reason: 'WaitingForPod',
        message: 'waiting for the predictor pod',
        resource: 'qwen3-4b-instruct',
        kind: 'LLMInferenceService',
        preset: 'qwen3-4b-instruct',
        gpus: 1,
        managedBy: 'model-manager',
      },
    },
  ],
};

const SERVING = '/agent-platform/models/serving';
const SERVE = `${SERVING}/serve`;

/** Serve model's page: its URL and its h1. */
async function expectServePage(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/agent-platform\/models\/serving\/serve/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Serve model' }),
  ).toBeVisible();
}

/** Cancel is a link in the page's footer, back to Running models. */
async function cancelServe(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Cancel' }).click();
  await expect(page).toHaveURL(/\/agent-platform\/models\/serving\/?$/);
}

/** The stubbed model-manager: the reads and the two serve tools; every other call goes through. */
async function stageModelManager(
  page: Page,
): Promise<ModelManagerStub & { unstage: () => Promise<void> }> {
  let served = false;
  await installPersistedQueryDrop(page);
  const stub = await stubModelManagerTools(page, {
    list_backends: { backends: [KSERVE_POOL_BACKEND] },
    list_presets: { presets: L4_POOL_PRESETS },
    // The pool launches its nodes on demand: none to pick from yet, so the
    // lab's own nodes stay out of the staged pool's Serve model page.
    list_nodes: { nodes: [] },
    list_models: () => (served ? servedModels : { models: [] }),
    check_fit: poolFitAnswer,
    load_model: () => {
      served = true;
      return loaded;
    },
  });
  return {
    ...stub,
    unstage: async () => {
      await stub.unroute();
      // Leave the page on the lab's real serving layer, the staged answers gone.
      await dropPersistedQueriesOnNextLoad(page);
      await page.goto(SERVING);
    },
  };
}

test.describe('serving: through model-manager as the person', () => {
  test('serving a preset on a GPU pool shows check_fit’s verdict and creates the LLMInferenceService through one load_model', async ({
    admin,
  }) => {
    const staged = await stageModelManager(admin);
    try {
      await dropPersistedQueriesOnNextLoad(admin);
      await open(admin, SERVING);

      await admin.getByRole('button', { name: /Serve model/ }).click();
      await expectServePage(admin);

      await expect(
        admin.getByRole('button', { name: /Preset/ }),
        'the first preset model-manager publishes is chosen',
      ).toHaveText(/Qwen3 4B Instruct/);
      const verdict = admin.getByTestId('serve-fit-verdict');
      await expect(
        verdict,
        'check_fit’s verdict stands before the button',
      ).toContainText('Fits — the node comes as g6.xlarge');
      await expect(verdict).toContainText('weights cached (index)');
      // The backends and the presets were read over muster too — no REST
      // proxy anywhere; one registered backend, so the installation is one
      // unnamed target and the calls name no backend (model-manager's default
      // answers). A model-manager running several names it (`backend:
      // 'kserve'`; covered by the unit tests).
      expect(staged.callsOf('list_backends').length).toBeGreaterThan(0);
      expect(staged.callsOf('list_presets')).toEqual([
        { name: 'x_model-manager_list_presets', arguments: {} },
      ]);
      expect(staged.callsOf('check_fit')).toEqual([
        {
          name: 'x_model-manager_check_fit',
          arguments: { model: 'qwen3-4b-instruct' },
        },
      ]);

      await admin.getByRole('button', { name: 'Serve', exact: true }).click();

      // Accepted: a toast, and Running models with the served model's steps open.
      await expect(admin).toHaveURL(/\/agent-platform\/models\/serving\/?$/);
      expect(
        staged.callsOf('load_model'),
        'one load_model, the preset by name, nothing composed in the browser',
      ).toEqual([
        {
          name: 'x_model-manager_load_model',
          arguments: { model: 'qwen3-4b-instruct' },
        },
      ]);
      await expect(
        admin.getByText(/LLMInferenceService qwen3-4b-instruct/),
        'the toast names the object model-manager composed',
      ).toBeVisible();
      await expect(
        admin.getByText(/scheduling: waiting for the predictor pod/),
        'and the first step of the timeline',
      ).toBeVisible();
      await expect(
        admin.getByTestId('served-model-lifecycle'),
        'the served model’s steps open on Running models',
      ).toBeVisible({ timeout: 30_000 });

      const row = admin.getByRole('row', { name: /qwen3-4b-instruct/ });
      await expect(
        row,
        'the served model is a row of the KServe group',
      ).toBeVisible({ timeout: 60_000 });
      await expect(row.getByText('Pending', { exact: true })).toBeVisible();
    } finally {
      await staged.unstage();
    }
  });

  test('a preset no size of the pool hosts cannot be served and says why', async ({
    admin,
  }) => {
    const staged = await stageModelManager(admin);
    try {
      await dropPersistedQueriesOnNextLoad(admin);
      await open(admin, SERVING);

      await admin.getByRole('button', { name: /Serve model/ }).click();
      await expectServePage(admin);
      await expect(admin.getByTestId('serve-fit-verdict')).toContainText(
        'Fits',
      );

      await admin.getByRole('button', { name: /Preset/ }).click();
      await admin.getByRole('option', { name: 'Qwen3 8B FP8' }).click();

      await expect(admin.getByTestId('serve-fit-verdict')).toContainText(
        `Cannot be served on this pool: ${NO_SIZE}`,
      );
      await expect(
        admin.getByRole('button', { name: 'Serve', exact: true }),
      ).toBeDisabled();
      expect(staged.callsOf('load_model')).toHaveLength(0);

      await cancelServe(admin);
    } finally {
      await staged.unstage();
    }
  });

  test('the pool panel’s link opens Serve model on that pool, installation and pool preselected', async ({
    admin,
  }) => {
    const staged = await stageModelManager(admin);
    try {
      await dropPersistedQueriesOnNextLoad(admin);
      await open(
        admin,
        `${SERVE}?installation=${lab.installation}&cluster=lab&pool=gpu-l4`,
      );

      await expectServePage(admin);
      await expect(admin.getByTestId('serve-target')).toHaveText(
        `On GPU pool gpu-l4 of cluster lab (${lab.installation})`,
      );
      await expect(admin.getByTestId('serve-fit-verdict')).toContainText(
        'Fits — the node comes as g6.xlarge',
      );

      await cancelServe(admin);

      // Deliberate legacy coverage: an older release's pool link opened the
      // Serve dialog in place with `?serve=1&…` on the Serving view. The view
      // now redirects it to Serve model's page, the seed intact.
      await test.step('the legacy ?serve=1 link redirects to Serve model', async () => {
        await open(
          admin,
          `${SERVING}?serve=1&installation=${lab.installation}&cluster=lab&pool=gpu-l4`,
        );
        await expectServePage(admin);
        const url = new URL(admin.url());
        expect(url.searchParams.has('serve'), 'serve=1 is gone').toBe(false);
        expect(
          url.searchParams.get('pool'),
          'the seed travels with the redirect',
        ).toBe('gpu-l4');
        await expect(admin.getByTestId('serve-target')).toHaveText(
          `On GPU pool gpu-l4 of cluster lab (${lab.installation})`,
        );
      });
    } finally {
      await staged.unstage();
    }
  });
});
