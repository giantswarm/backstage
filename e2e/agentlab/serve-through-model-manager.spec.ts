import type { Page, Route } from '@playwright/test';
import { expect, open, test } from './fixtures';
import { lab } from './lab';

/**
 * Serve on a GPU pool through model-manager as the signed-in person
 * (giantswarm/backstage#2415, part 1): the dialog lists the presets
 * model-manager publishes for the cluster, shows `check_fit`'s verdict before
 * the button, serves with one `load_model` over muster, and the object that
 * comes back is the `LLMInferenceService` model-manager composed — nothing is
 * composed in the browser.
 *
 * **model-manager's answers are stubbed at the browser**; everything else is
 * real (the sign-in, muster's `call` route, the page). The lab has no KServe
 * and no GPU pool, so the reads the Serving page makes over the REST seam —
 * the backends, the inventory, the presets — and the two tool calls the
 * dialog makes over muster — `x_model-manager_check_fit` and
 * `x_model-manager_load_model` — are answered here in the shapes model-manager
 * 0.24.0 produces for a kserve backend a GPU pool registered. Nothing is
 * written; the stubbed load flips the stubbed inventory to the served model.
 */

const PERSISTER_KEY = 'agent-platform-react-query-cache';
const DROP_FLAG = 'e2e-drop-persisted-queries';

async function dropPersistedQueriesOnNextLoad(page: Page): Promise<void> {
  await page.evaluate(
    flag => window.sessionStorage.setItem(flag, '1'),
    DROP_FLAG,
  );
}

const NO_SIZE =
  'no size of the pool hosts qwen3-8b-fp8: needs 21.1 GB, the largest size g6.xlarge has 24 GB of which 22 GB are usable';

/** `GET /api/v1/backends`: the kserve backend a GPU pool registered, able to load with presets and a fit check. */
const backends = {
  backends: [
    {
      backend: 'kserve',
      source: 'cluster-manager',
      endpoint: 'https://kubernetes.default.svc',
      healthy: true,
      capabilities: {
        pull: false,
        pullProgress: false,
        delete: false,
        load: true,
        unload: true,
        loadedModels: true,
        wire: true,
        presets: true,
        fitCheck: true,
        nodeInventory: false,
        search: false,
      },
      loading: { onDemand: false, idleEviction: false },
      wiring: { namespace: 'kagent', apiVersion: 'v1alpha3', autoWire: true },
    },
  ],
};

/** `GET /api/v1/presets?backend=kserve`: what model-manager publishes for the cluster. */
const presets = {
  presets: [
    {
      name: 'qwen3-4b-instruct',
      displayName: 'Qwen3 4B Instruct',
      description: 'Chat and tools, 32k context',
      model: 'Qwen/Qwen3-4B-Instruct-2507',
      format: 'vLLM',
      contextLength: 32768,
      gpus: 1,
      weightsBytes: 8_060_000_000,
    },
    {
      name: 'qwen3-8b-fp8',
      displayName: 'Qwen3 8B FP8',
      model: 'Qwen/Qwen3-8B-FP8',
      format: 'vLLM',
      contextLength: 32768,
      gpus: 1,
      weightsBytes: 9_000_000_000,
    },
  ],
};

/** `check_fit` on the pool: the 4B preset fits and its weights are in the claim; the 8B one fits no size. */
const fit: Record<string, unknown> = {
  'qwen3-4b-instruct': {
    model: 'qwen3-4b-instruct',
    backend: 'kserve',
    fits: true,
    instanceType: 'g6.xlarge',
    budgetSource: 'pool-scale-from-zero',
    cached: true,
    cacheSource: 'index',
    weightsBytes: 8_060_000_000,
    overheadBytes: 4_000_000_000,
    requiredBytes: 12_060_000_000,
  },
  'qwen3-8b-fp8': {
    model: 'qwen3-8b-fp8',
    backend: 'kserve',
    fits: false,
    reason: NO_SIZE,
    budgetSource: 'pool-scale-from-zero',
    cached: false,
    cacheSource: 'unknown',
    requiredBytes: 21_100_000_000,
  },
};

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
  fit: fit['qwen3-4b-instruct'],
};

/** `GET /api/v1/models` once the load was accepted: the served model, its predictor pod awaited. */
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

type ToolCall = { name: string; arguments: Record<string, unknown> };

/** The stubbed model-manager: REST reads and the two tool calls; every other request goes through. */
async function stageModelManager(page: Page): Promise<{
  calls: ToolCall[];
  unstage: () => Promise<void>;
}> {
  const calls: ToolCall[] = [];
  let served = false;
  const ofThisInstallation = (url: URL) =>
    url.searchParams.get('installation') === lab.installation;
  const isRead = (path: string) => (url: URL) =>
    url.pathname.endsWith(`/model-manager/${path}`) && ofThisInstallation(url);

  await page.addInitScript(
    ([key, flag]) => {
      if (window.sessionStorage.getItem(flag)) {
        window.sessionStorage.removeItem(flag);
        window.localStorage.removeItem(key);
      }
    },
    [PERSISTER_KEY, DROP_FLAG] as const,
  );
  await page.route(isRead('backends'), route =>
    route.fulfill({ json: backends }),
  );
  await page.route(isRead('presets'), route =>
    route.fulfill({ json: presets }),
  );
  await page.route(isRead('models'), route =>
    route.fulfill({ json: served ? servedModels : { models: [] } }),
  );
  const onCall = async (route: Route) => {
    const body = route.request().postDataJSON() as ToolCall | undefined;
    if (
      body?.name !== 'x_model-manager_check_fit' &&
      body?.name !== 'x_model-manager_load_model'
    ) {
      await route.continue();
      return;
    }
    calls.push(body);
    const model = String(body.arguments?.model ?? '');
    if (body.name === 'x_model-manager_check_fit') {
      await route.fulfill({ json: fit[model] ?? { model, fits: false } });
      return;
    }
    served = true;
    await route.fulfill({ json: loaded });
  };
  await page.route('**/api/muster/call**', onCall);

  return {
    calls,
    unstage: async () => {
      await page.unroute('**/api/muster/call**', onCall);
      await page.unroute(isRead('backends'));
      await page.unroute(isRead('presets'));
      await page.unroute(isRead('models'));
      // Leave the page on the lab's real serving layer, the staged answers gone.
      await dropPersistedQueriesOnNextLoad(page);
      await page.goto('/agent-platform/models/serving');
    },
  };
}

const SERVING = '/agent-platform/models/serving';

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
      expect(staged.calls).toEqual([
        {
          name: 'x_model-manager_check_fit',
          arguments: { model: 'qwen3-4b-instruct', backend: 'kserve' },
        },
      ]);

      await dialog.getByRole('button', { name: 'Serve' }).click();

      await expect(dialog).toBeHidden();
      expect(
        staged.calls.filter(call => call.name === 'x_model-manager_load_model'),
        'one load_model, the preset by name, nothing composed in the browser',
      ).toEqual([
        {
          name: 'x_model-manager_load_model',
          arguments: { model: 'qwen3-4b-instruct', backend: 'kserve' },
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
      expect(
        staged.calls.some(call => call.name === 'x_model-manager_load_model'),
      ).toBe(false);

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
