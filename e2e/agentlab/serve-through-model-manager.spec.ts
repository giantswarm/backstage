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
 * giantswarm/backstage#2294): the dialog lists the presets model-manager
 * publishes for the cluster, shows `check_fit`'s verdict before the button,
 * serves with one `load_model` over muster, and the object that comes back is
 * the `LLMInferenceService` model-manager composed — nothing is composed in
 * the browser.
 *
 * **model-manager's answers are stubbed at the browser**; everything else is
 * real (the sign-in, muster's `call` route, the page). The lab has no KServe
 * and no GPU pool, so the tool calls the Serving page and the dialog make over
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

/** The stubbed model-manager: the reads and the two serve tools; every other call goes through. */
async function stageModelManager(
  page: Page,
): Promise<ModelManagerStub & { unstage: () => Promise<void> }> {
  let served = false;
  await installPersistedQueryDrop(page);
  const stub = await stubModelManagerTools(page, {
    list_backends: { backends: [KSERVE_POOL_BACKEND] },
    list_presets: { presets: L4_POOL_PRESETS },
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
      const dialog = admin.getByRole('dialog', { name: 'Serve model' });
      await expect(dialog).toBeVisible();

      await expect(
        dialog.getByRole('button', { name: /Preset/ }),
        'the first preset model-manager publishes is chosen',
      ).toHaveText(/Qwen3 4B Instruct/);
      const verdict = dialog.getByTestId('serve-fit-verdict');
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

      await dialog.getByRole('button', { name: 'Serve' }).click();

      await expect(dialog).toBeHidden();
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
      const dialog = admin.getByRole('dialog', { name: 'Serve model' });
      await expect(dialog.getByTestId('serve-fit-verdict')).toContainText(
        'Fits',
      );

      await dialog.getByRole('button', { name: /Preset/ }).click();
      await admin.getByRole('option', { name: 'Qwen3 8B FP8' }).click();

      await expect(dialog.getByTestId('serve-fit-verdict')).toContainText(
        `Cannot be served on this pool: ${NO_SIZE}`,
      );
      await expect(
        dialog.getByRole('button', { name: 'Serve' }),
      ).toBeDisabled();
      expect(staged.callsOf('load_model')).toHaveLength(0);

      await dialog.getByRole('button', { name: 'Cancel' }).click();
    } finally {
      await staged.unstage();
    }
  });

  test('the pool panel’s link opens the dialog on that pool, installation and pool preselected', async ({
    admin,
  }) => {
    const staged = await stageModelManager(admin);
    try {
      await dropPersistedQueriesOnNextLoad(admin);
      await open(
        admin,
        `${SERVING}?serve=1&installation=${lab.installation}&cluster=lab&pool=gpu-l4`,
      );

      const dialog = admin.getByRole('dialog', { name: 'Serve model' });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByTestId('serve-target')).toHaveText(
        `On GPU pool gpu-l4 of cluster lab (${lab.installation})`,
      );
      await expect(dialog.getByTestId('serve-fit-verdict')).toContainText(
        'Fits — the node comes as g6.xlarge',
      );
      expect(
        new URL(admin.url()).searchParams.get('serve'),
        'the route is read once and stripped',
      ).toBeNull();

      await dialog.getByRole('button', { name: 'Cancel' }).click();
    } finally {
      await staged.unstage();
    }
  });
});
