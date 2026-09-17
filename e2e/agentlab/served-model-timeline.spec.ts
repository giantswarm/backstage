import type { Page, Route } from '@playwright/test';
import { expect, open, test } from './fixtures';
import { lab } from './lab';

/**
 * The served model's step timeline (giantswarm/backstage#2415, part 2):
 * Serve → the timeline opens on the object model-manager composed → the
 * steps turn done in order as `list_loaded_models` reports them (the weights
 * step with bytes, then _cached_) → Ready shows the endpoint, the ModelConfig
 * and **Try it** (401 without a token, 200 as the person) → Stop serving
 * reads _Stopping_ until model-manager no longer lists the model.
 *
 * **model-manager's answers are stubbed at the browser** in the shapes of
 * model-manager 0.24.0 (`phase`, `steps[]`, the weights step's bytes and
 * `cached`); the lab has no KServe and no GPU. The inventory read advances
 * one stage per poll — the page polls at 10 s while a served model is on its
 * way, which is what this spec measures. The two tool calls (`check_fit`,
 * `load_model`) go through muster and are stubbed there; Try it and Stop
 * serving go over the portal's backend and are stubbed at its routes. Nothing
 * is written.
 */

const PERSISTER_KEY = 'agent-platform-react-query-cache';
const DROP_FLAG = 'e2e-drop-persisted-queries';

async function dropPersistedQueriesOnNextLoad(page: Page): Promise<void> {
  await page.evaluate(
    flag => window.sessionStorage.setItem(flag, '1'),
    DROP_FLAG,
  );
}

const T = {
  created: '2026-09-17T06:59:00Z',
  nominated: '2026-09-17T06:59:35Z',
  bound: '2026-09-17T07:03:02Z',
  downloading: '2026-09-17T07:03:22Z',
  downloaded: '2026-09-17T07:04:34Z',
  pulled: '2026-09-17T07:08:34Z',
  loaded: '2026-09-17T07:09:40Z',
  ready: '2026-09-17T07:09:45Z',
};

const ENDPOINT = 'https://models.lab.example/model-serving/qwen3-4b-instruct';
const IMAGE = 'ghcr.io/llm-d/llm-d-cuda:v0.4.0';

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

const presets = {
  presets: [
    {
      name: 'qwen3-4b-instruct',
      displayName: 'Qwen3 4B Instruct',
      model: 'Qwen/Qwen3-4B-Instruct-2507',
      format: 'vLLM',
      contextLength: 32768,
      gpus: 1,
      weightsBytes: 8_060_000_000,
    },
  ],
};

const fit = {
  model: 'qwen3-4b-instruct',
  backend: 'kserve',
  fits: true,
  instanceType: 'g6.xlarge',
  budgetSource: 'pool-scale-from-zero',
  cached: false,
  cacheSource: 'index',
  weightsBytes: 8_060_000_000,
  requiredBytes: 12_060_000_000,
};

type Step = Record<string, unknown>;
const pending = (name: string): Step => ({ name, state: 'pending' });
const done = (
  name: string,
  since: string,
  finishedAt: string,
  extra: Step = {},
): Step => ({
  name,
  state: 'done',
  since,
  finishedAt,
  ...extra,
});

/** `load_model`'s answer: the first step under way. */
const loadAnswer = {
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
        since: T.created,
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
      ].map(pending),
    ],
  },
  fit,
};

/** The served model of `GET /api/v1/models` at each stage of the timeline. */
function servedModel(running: Record<string, unknown>) {
  return {
    models: [
      {
        name: 'Qwen/Qwen3-4B-Instruct-2507',
        backend: 'kserve',
        sizeBytes: 8_060_000_000,
        format: 'vLLM',
        downloaded: false,
        path: 'qwen3-4b-instruct',
        preset: 'qwen3-4b-instruct',
        loaded: true,
        running: {
          name: 'Qwen/Qwen3-4B-Instruct-2507',
          backend: 'kserve',
          resource: 'qwen3-4b-instruct',
          kind: 'LLMInferenceService',
          preset: 'qwen3-4b-instruct',
          gpus: 1,
          managedBy: 'model-manager',
          ...running,
        },
        ...(running.status === 'Ready' && {
          modelConfig: {
            name: 'qwen3-4b-instruct',
            namespace: 'kagent',
            managed: true,
            ready: true,
            providerModel: 'qwen3-4b-instruct',
            endpoint: `${ENDPOINT}/v1`,
          },
        }),
      },
    ],
  };
}

const doneScheduling = done('scheduling', T.created, T.nominated);
const doneNode = done('nodeStarting', T.nominated, T.bound);
const doneWeights = done('downloadingWeights', T.downloading, T.downloaded, {
  bytesTotal: 8_060_000_000,
  cached: true,
});
const donePull = done('pullingImage', T.downloaded, T.pulled, {
  message: `Successfully pulled image "${IMAGE}" in 4m0.1s`,
});
const doneLoading = done('loading', T.pulled, T.loaded);
const doneRouting = done('routing', T.loaded, T.ready);

const stages = {
  downloading: servedModel({
    status: 'Pending',
    reason: 'DownloadingWeights',
    message:
      'DownloadingWeights storage-initializer downloading the weights into the cache claim: 2.9 GiB of 7.5 GiB',
    phase: 'downloadingWeights',
    steps: [
      doneScheduling,
      doneNode,
      {
        name: 'downloadingWeights',
        state: 'inProgress',
        since: T.downloading,
        reason: 'DownloadingWeights',
        message:
          'storage-initializer downloading the weights into the cache claim',
        bytesCompleted: 3_100_000_000,
        bytesTotal: 8_060_000_000,
      },
      ...['pullingImage', 'loading', 'routing', 'ready'].map(pending),
    ],
  }),
  loading: servedModel({
    status: 'NotReady',
    reason: 'PredictorNotReady',
    message: 'PredictorNotReady Startup probe failed: connection refused',
    phase: 'loading',
    steps: [
      doneScheduling,
      doneNode,
      doneWeights,
      donePull,
      {
        name: 'loading',
        state: 'inProgress',
        since: T.pulled,
        reason: 'LoadingModel',
        message: 'Startup probe failed: connection refused',
      },
      pending('routing'),
      pending('ready'),
    ],
  }),
  ready: servedModel({
    status: 'Ready',
    endpoint: ENDPOINT,
    phase: 'ready',
    steps: [
      doneScheduling,
      doneNode,
      doneWeights,
      donePull,
      doneLoading,
      doneRouting,
      done('ready', T.ready, T.ready),
    ],
  }),
  terminating: servedModel({
    status: 'Terminating',
    endpoint: ENDPOINT,
    phase: 'terminating',
    steps: [
      doneScheduling,
      doneNode,
      doneWeights,
      donePull,
      doneLoading,
      doneRouting,
      done('ready', T.ready, T.ready),
    ],
  }),
  gone: { models: [] },
};

type StageName = keyof typeof stages;
const TIMELINE: StageName[] = ['downloading', 'loading', 'ready'];

const tryAnswer = {
  url: `${ENDPOINT}/v1/chat/completions`,
  model: 'qwen3-4b-instruct',
  without: {
    status: 401,
    error: 'authentication failure: no bearer token found',
  },
  with: { status: 200, content: 'pong', latencyMs: 1_240 },
};

type ToolCall = { name: string; arguments: Record<string, unknown> };

/**
 * The stubbed model-manager: the inventory read moves one stage per request
 * once the load was accepted and stays at `ready` until the unload, which
 * moves it to `terminating` and then off the list.
 */
async function stageModelManager(page: Page): Promise<{
  calls: ToolCall[];
  reads: StageName[];
  unstage: () => Promise<void>;
}> {
  const calls: ToolCall[] = [];
  const reads: StageName[] = [];
  let served = false;
  let stage = 0;
  let stopped: 'terminating' | 'gone' | undefined;
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
  await page.route(isRead('models'), route => {
    if (!served) {
      return route.fulfill({ json: { models: [] } });
    }
    let name: StageName;
    if (stopped === 'terminating') {
      name = 'terminating';
      stopped = 'gone';
    } else if (stopped === 'gone') {
      name = 'gone';
    } else {
      name = TIMELINE[Math.min(stage, TIMELINE.length - 1)];
      stage += 1;
    }
    reads.push(name);
    return route.fulfill({ json: stages[name] });
  });
  await page.route(isRead('models/unload'), route => {
    stopped = 'terminating';
    return route.fulfill({
      json: {
        backend: 'kserve',
        model: 'qwen3-4b-instruct',
        loaded: false,
        status: 'Terminating',
      },
    });
  });
  await page.route(isRead('models/try'), route =>
    route.fulfill({ json: tryAnswer }),
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
    if (body.name === 'x_model-manager_check_fit') {
      await route.fulfill({ json: fit });
      return;
    }
    served = true;
    await route.fulfill({ json: loadAnswer });
  };
  await page.route('**/api/muster/call**', onCall);

  return {
    calls,
    reads,
    unstage: async () => {
      await page.unroute('**/api/muster/call**', onCall);
      for (const path of [
        'backends',
        'presets',
        'models',
        'models/unload',
        'models/try',
      ]) {
        await page.unroute(isRead(path));
      }
      await dropPersistedQueriesOnNextLoad(page);
      await page.goto('/agent-platform/models/serving');
    },
  };
}

const SERVING = '/agent-platform/models/serving';
/** One inventory poll while a served model is on its way (10 s) plus render. */
const POLL_TIMEOUT = 30_000;

test.describe('serving: the served model’s step timeline', () => {
  test('Serve opens the timeline; the steps turn done in order with the weights’ bytes, then cached; Ready shows the endpoint, the ModelConfig and Try it answering 401 without and 200 as the person', async ({
    admin,
  }) => {
    const staged = await stageModelManager(admin);
    try {
      await dropPersistedQueriesOnNextLoad(admin);
      await open(admin, SERVING);

      await admin.getByRole('button', { name: /Serve model/ }).click();
      const dialog = admin.getByRole('dialog', { name: 'Serve model' });
      await expect(dialog.getByTestId('serve-fit-verdict')).toContainText(
        'Fits — the node comes as g6.xlarge',
      );
      await dialog.getByRole('button', { name: 'Serve' }).click();
      await expect(dialog).toBeHidden();

      const panel = admin.getByTestId('served-model-lifecycle');
      await expect(
        panel,
        'Serve opens the timeline on the object model-manager composed',
      ).toBeVisible();
      await expect(panel).toContainText('Model qwen3-4b-instruct');

      const step = (name: string) =>
        panel.locator(`[data-testid="lifecycle-step"][data-step="${name}"]`);

      // Stage 1: the node is up, the weights download — with bytes.
      await expect(step('scheduling')).toHaveAttribute('data-state', 'done', {
        timeout: POLL_TIMEOUT,
      });
      await expect(step('scheduling')).toContainText('Predictor pod scheduled');
      await expect(step('scheduling')).toContainText('took 35 s');
      await expect(step('nodeStarting')).toHaveAttribute('data-state', 'done');
      await expect(step('nodeStarting')).toContainText('took 3 min 27 s');
      await expect(step('downloadingWeights')).toHaveAttribute(
        'data-state',
        'inProgress',
      );
      await expect(
        step('downloadingWeights'),
        'the weights step shows the bytes downloaded so far',
      ).toContainText('2.9 GiB of 7.5 GiB');
      await expect(step('downloadingWeights')).toContainText('typ. 1 min 13 s');
      await expect(step('pullingImage')).toHaveAttribute(
        'data-state',
        'pending',
      );
      await expect(step('pullingImage')).toContainText('typ. 4 min');
      await expect(panel).toContainText('weights in the cache');

      // Stage 2 (the next poll, 10 s): weights cached, image pulled, vLLM loading.
      await expect(step('loading')).toHaveAttribute(
        'data-state',
        'inProgress',
        {
          timeout: POLL_TIMEOUT,
        },
      );
      await expect(
        step('downloadingWeights'),
        'once done the weights step says cached',
      ).toContainText('cached — the claim already held the weights');
      await expect(step('pullingImage')).toHaveAttribute('data-state', 'done');
      await expect(step('pullingImage')).toContainText('took 4 min');
      await expect(step('loading')).toContainText(
        'LoadingModel: Startup probe failed: connection refused',
      );

      // Stage 3: Ready — endpoint, ModelConfig, Try it.
      await expect(step('ready')).toHaveAttribute('data-state', 'done', {
        timeout: POLL_TIMEOUT,
      });
      await expect(panel).toContainText('· ready');
      await expect(panel.getByTestId('served-model-endpoint')).toHaveText(
        ENDPOINT,
      );
      await expect(panel.getByTestId('served-model-config')).toContainText(
        'ModelConfig kagent/qwen3-4b-instruct',
      );
      await panel.getByRole('button', { name: 'Try it' }).click();
      await expect(
        panel.getByTestId('served-model-try'),
        'one completion without a token and one as the person, both outcomes shown',
      ).toContainText('401 without a token · 200 as you in 1 s — “pong”');
      await expect(panel).toContainText(
        `POST ${ENDPOINT}/v1/chat/completions · model qwen3-4b-instruct`,
      );

      expect(
        staged.reads.slice(0, 3),
        'the inventory was read once per stage: the page polled at 10 s while the model was on its way',
      ).toEqual(['downloading', 'loading', 'ready']);
      expect(staged.calls.map(call => call.name)).toEqual([
        'x_model-manager_check_fit',
        'x_model-manager_load_model',
      ]);

      // The row's chevron hides and shows the same timeline.
      const row = admin.getByRole('row', { name: /qwen3-4b-instruct/ });
      await row
        .getByRole('button', { name: 'Hide steps of model qwen3-4b-instruct' })
        .click();
      await expect(panel).toBeHidden();
      await row
        .getByRole('button', { name: 'Show steps of model qwen3-4b-instruct' })
        .click();
      await expect(panel).toBeVisible();

      // Stop serving: Stopping until model-manager no longer lists the model.
      await row
        .getByRole('button', { name: 'Actions for qwen3-4b-instruct' })
        .click();
      await admin.getByRole('menuitem', { name: 'Stop serving…' }).click();
      await admin.getByRole('button', { name: 'Stop serving' }).click();
      await expect(
        row.getByText('Stopping', { exact: true }),
        'the row reads Stopping while the object is deleted',
      ).toBeVisible({ timeout: POLL_TIMEOUT });
      await expect(panel).toContainText('· stopping');
      await expect(
        panel.getByTestId('served-model-gone'),
        'and the panel says so once model-manager no longer lists it',
      ).toBeVisible({ timeout: POLL_TIMEOUT });
      await expect(row).toBeHidden();
    } finally {
      await staged.unstage();
    }
  });

  test('a failed step carries the reason, never a bare Pending', async ({
    admin,
  }) => {
    const failed = servedModel({
      status: 'Pending',
      reason: 'ImagePullBackOff',
      message: `ImagePullBackOff Back-off pulling image "${IMAGE}"`,
      phase: 'failed',
      steps: [
        doneScheduling,
        doneNode,
        doneWeights,
        {
          name: 'pullingImage',
          state: 'failed',
          since: T.downloaded,
          reason: 'ImagePullBackOff',
          message: `Back-off pulling image "${IMAGE}"`,
        },
        pending('loading'),
        pending('routing'),
        pending('ready'),
      ],
    });
    const ofThisInstallation = (url: URL) =>
      url.searchParams.get('installation') === lab.installation;
    const isRead = (path: string) => (url: URL) =>
      url.pathname.endsWith(`/model-manager/${path}`) &&
      ofThisInstallation(url);
    await admin.addInitScript(
      ([key, flag]) => {
        if (window.sessionStorage.getItem(flag)) {
          window.sessionStorage.removeItem(flag);
          window.localStorage.removeItem(key);
        }
      },
      [PERSISTER_KEY, DROP_FLAG] as const,
    );
    await admin.route(isRead('backends'), route =>
      route.fulfill({ json: backends }),
    );
    await admin.route(isRead('presets'), route =>
      route.fulfill({ json: presets }),
    );
    await admin.route(isRead('models'), route =>
      route.fulfill({ json: failed }),
    );
    try {
      await dropPersistedQueriesOnNextLoad(admin);
      await open(admin, SERVING);
      const row = admin.getByRole('row', { name: /qwen3-4b-instruct/ });
      await expect(row).toBeVisible({ timeout: 60_000 });
      await expect(row.getByTestId('served-readiness-reason')).toHaveText(
        '· ImagePullBackOff',
      );
      await row
        .getByRole('button', { name: 'Show steps of model qwen3-4b-instruct' })
        .click();
      const panel = admin.getByTestId('served-model-lifecycle');
      await expect(panel).toContainText('· failed · ImagePullBackOff');
      const pull = panel.locator(
        '[data-testid="lifecycle-step"][data-step="pullingImage"]',
      );
      await expect(pull).toHaveAttribute('data-state', 'failed');
      await expect(pull).toContainText(
        `ImagePullBackOff: Back-off pulling image "${IMAGE}"`,
      );
      await expect(
        panel.locator('[data-testid="lifecycle-step"][data-step="loading"]'),
      ).toHaveAttribute('data-state', 'pending');
    } finally {
      for (const path of ['backends', 'presets', 'models']) {
        await admin.unroute(isRead(path));
      }
      await dropPersistedQueriesOnNextLoad(admin);
      await admin.goto(SERVING);
    }
  });
});
