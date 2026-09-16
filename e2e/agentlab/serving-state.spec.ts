import type { Page } from '@playwright/test';
import { expect, open, test } from './fixtures';
import { lab } from './lab';

/**
 * The Serving page on a served model that is not Ready — the word for what
 * is wrong next to the status, the backend's text under it
 * (giantswarm/backstage#2400).
 *
 * On gazelle a person served a model on a GPU pool that had no schedulable
 * node yet and could not see through the platform why it never came up: the
 * LLMInferenceService's predictor pod sat Pending, and the portal said
 * "Pending" with the scheduler's message in a tooltip. model-manager 0.23.4
 * (giantswarm/model-manager#93) names the reason next to `status` and
 * `message`; this spec drives the portal through that answer.
 *
 * **model-manager's answer is stubbed at the browser**; everything else is
 * real. The lab has no KServe and its model-manager serves the host's models,
 * so the two reads the Serving page makes of it — the backends and the
 * inventory — are answered here in the shapes model-manager 0.23.4 produces
 * for a kserve backend with one LLMInferenceService whose predictor pod waits
 * for a GPU node. The lab's own backends are out of the picture for the one
 * page load; nothing is written.
 */

const SCHEDULER =
  '0/3 nodes are available: 3 Insufficient nvidia.com/gpu. preemption: 0/3 nodes are available: 3 No preemption victims found for incoming pod.';

/**
 * Full-page screenshots of the states this spec reaches, when a directory is
 * given (`AGENTLAB_E2E_SCREENSHOTS=<dir>`): what the PR shows a reviewer. Off
 * by default — the suite's own screenshots are its failure evidence.
 */
async function snapshot(page: Page, name: string): Promise<void> {
  const dir = process.env.AGENTLAB_E2E_SCREENSHOTS;
  if (!dir) {
    return;
  }
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
}

/** model-manager 0.23.4's `GET /api/v1/backends` for a kserve backend a GPU pool registered. */
const backends = {
  backends: [
    {
      backend: 'kserve',
      source: 'cluster-manager',
      endpoint: 'https://kubernetes.default.svc',
      healthy: true,
      capabilities: {
        pull: true,
        pullProgress: true,
        delete: true,
        load: true,
        unload: true,
        loadedModels: true,
        wire: true,
        // Off, so the page asks nothing else of the stub.
        presets: false,
        fitCheck: false,
        nodeInventory: false,
        search: false,
      },
      loading: { onDemand: false, idleEviction: false },
      wiring: { namespace: 'kagent', apiVersion: 'v1alpha3', autoWire: true },
    },
  ],
};

/** `GET /api/v1/models`: the one served model, its predictor pod Pending for want of a GPU node. */
const models = {
  models: [
    {
      name: 'Qwen/Qwen3-4B-Instruct-2507',
      backend: 'kserve',
      sizeBytes: 8_050_000_000,
      format: 'vLLM',
      contextLength: 32768,
      capabilities: ['chat', 'tools'],
      downloaded: false,
      path: 'qwen3-4b-instruct',
      preset: 'qwen3-4b-instruct',
      loaded: true,
      running: {
        name: 'Qwen/Qwen3-4B-Instruct-2507',
        backend: 'kserve',
        sizeBytes: 8_050_000_000,
        contextLength: 32768,
        endpoint:
          'http://qwen3-4b-instruct-predictor.model-serving.svc.cluster.local',
        status: 'Pending',
        reason: 'Unschedulable',
        message: `Unschedulable ${SCHEDULER}`,
        resource: 'qwen3-4b-instruct',
        kind: 'LLMInferenceService',
        preset: 'qwen3-4b-instruct',
        gpus: 1,
        managedBy: 'model-manager',
      },
    },
  ],
};

test('a served model whose predictor pod waits reads Pending · Unschedulable with the scheduler’s text', async ({
  admin,
}) => {
  const ofThisInstallation = (url: URL) =>
    url.searchParams.get('installation') === lab.installation;
  await admin.route(
    url =>
      url.pathname.endsWith('/model-manager/backends') &&
      ofThisInstallation(url),
    route => route.fulfill({ json: backends }),
  );
  await admin.route(
    url =>
      url.pathname.endsWith('/model-manager/models') && ofThisInstallation(url),
    route => route.fulfill({ json: models }),
  );

  try {
    await open(admin, '/agent-platform/models/serving');

    const row = admin.getByRole('row', { name: /qwen3-4b-instruct/ });
    await expect(
      row,
      'the LLMInferenceService model-manager lists is a row of the KServe group',
    ).toBeVisible({ timeout: 60_000 });
    await expect(row.getByText('Pending', { exact: true })).toBeVisible();
    await expect(
      row.getByTestId('served-readiness-reason'),
      'the scheduler’s word sits next to the status',
    ).toHaveText('· Unschedulable');
    await expect(
      row.getByText(SCHEDULER, { exact: true }),
      'the scheduler’s text is under the label, not only on hover',
    ).toBeVisible();
    await expect(
      row
        .getByText('Pending', { exact: true })
        .locator('xpath=ancestor::*[@title][1]'),
      'and on hover',
    ).toHaveAttribute('title', SCHEDULER);
    await snapshot(admin, 'serving-pending-unschedulable');
  } finally {
    await admin.unroute(url =>
      url.pathname.endsWith('/model-manager/backends'),
    );
    await admin.unroute(url => url.pathname.endsWith('/model-manager/models'));
  }
});
