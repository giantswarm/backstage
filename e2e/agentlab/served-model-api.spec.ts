import type { Page } from '@playwright/test';
import { expect, open, test } from './fixtures';
import { lab } from './lab';
import {
  dropPersistedQueriesOnNextLoad,
  installPersistedQueryDrop,
  stubModelManagerTools,
} from './model-manager.fixture';

/**
 * The APIs a served model answers (giantswarm/backstage#2495): model-manager
 * reports per Ready model the runtime and the interfaces its server
 * registered (1.1.0 on) and, on an installation with the platform's LLM
 * endpoint, the model's public name with the endpoint's URL (1.2.0 on). The
 * Models page shows an API chip per interface, the runtime version, the
 * public name, a copy action yielding the URL a client uses, and one request
 * per interface filled with that URL and the name to send.
 *
 * **model-manager's answers are stubbed at the browser** in model-manager
 * 1.2.0's shapes (`runtime`, `interfaces`, `publicName`), for a model of a
 * name nothing in the lab serves, so a served model the lab's own KServe CRs
 * list beside it never takes its place; the lab's own CPU-served model reports
 * the same shapes once that release runs there. Nothing is written.
 */

const SERVING = '/agent-platform/models/serving';
const GATEWAY = 'https://models.lab.example/model-serving/qwen-stub-api';
const LLM_ENDPOINT = 'http://agentgateway.agent-platform.svc:8081';

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

const generate = [
  { type: 'Completions', path: '/v1/chat/completions' },
  { type: 'Responses', path: '/v1/responses' },
  { type: 'Messages', path: '/v1/messages' },
  { type: 'AnthropicTokenCount', path: '/v1/messages/count_tokens' },
];

/** `list_models` with one Ready model: on the models Gateway, or on the LLM endpoint. */
function models(onEndpoint: boolean) {
  return {
    models: [
      {
        name: 'Qwen/Qwen2.5-0.5B-Instruct',
        backend: 'kserve',
        format: 'vLLM',
        downloaded: false,
        path: 'qwen-stub-api',
        preset: 'qwen-stub-api',
        capabilities: ['chat', 'tools'],
        loaded: true,
        running: {
          name: 'Qwen/Qwen2.5-0.5B-Instruct',
          backend: 'kserve',
          resource: 'qwen-stub-api',
          kind: 'LLMInferenceService',
          preset: 'qwen-stub-api',
          managedBy: 'model-manager',
          status: 'Ready',
          phase: 'ready',
          steps: [
            {
              name: 'ready',
              state: 'done',
              since: '2026-09-24T18:00:00Z',
              finishedAt: '2026-09-24T18:00:05Z',
            },
          ],
          endpoint: onEndpoint ? LLM_ENDPOINT : GATEWAY,
          runtime: { name: 'vllm', version: '0.1.dev1+g51f799c1a' },
          interfaces: generate,
          ...(onEndpoint && { publicName: 'qwen-stub-api' }),
        },
        modelConfig: {
          name: 'qwen-stub-api',
          namespace: 'kagent',
          managed: true,
          ready: true,
          providerModel: onEndpoint
            ? 'qwen-stub-api'
            : 'Qwen/Qwen2.5-0.5B-Instruct',
          endpoint: `${onEndpoint ? LLM_ENDPOINT : GATEWAY}/v1`,
        },
      },
    ],
  };
}

async function stage(page: Page, onEndpoint: boolean) {
  await installPersistedQueryDrop(page);
  const stub = await stubModelManagerTools(page, {
    list_backends: backends,
    list_presets: { presets: [] },
    list_models: models(onEndpoint),
  });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: new URL(lab.baseURL).origin,
  });
  return stub;
}

const clipboard = (page: Page) =>
  page.evaluate(() => navigator.clipboard.readText());

test.describe('serving: the APIs a served model answers', () => {
  test('a model on the models Gateway: an API chip per interface, the runtime version, and requests with the person’s token', async ({
    admin,
  }) => {
    const stub = await stage(admin, false);
    try {
      await dropPersistedQueriesOnNextLoad(admin);
      await open(admin, SERVING);

      const grid = admin.getByRole('grid');
      await expect(
        grid.getByRole('columnheader', { name: 'API' }),
      ).toBeVisible();
      const row = grid.getByRole('row', { name: /qwen-stub-api/ });
      for (const chip of [
        'Chat completions',
        'Responses',
        'Messages',
        'count_tokens',
      ]) {
        await expect(row.getByText(chip, { exact: true })).toBeVisible();
      }
      await expect(
        admin.getByText('KServe · vLLM 0.1.dev1+g51f799c1a'),
        'the runtime version next to the runtime name',
      ).toBeVisible();

      await row
        .getByRole('button', { name: 'Show steps of model qwen-stub-api' })
        .click();
      const panel = admin.getByTestId('served-model-lifecycle');
      await expect(panel.getByTestId('served-model-endpoint')).toHaveText(
        GATEWAY,
      );
      const examples = panel.getByTestId('served-model-examples');
      await expect(examples).toContainText('TOKEN is your Dex ID token');
      await panel
        .getByRole('button', { name: 'Copy the Chat completions request' })
        .click();
      const chat = await clipboard(admin);
      expect(chat).toContain(`curl -sS ${GATEWAY}/v1/chat/completions`);
      expect(chat).toContain('-H "Authorization: Bearer $TOKEN"');
      expect(chat).toContain('"model":"Qwen/Qwen2.5-0.5B-Instruct"');
      await panel
        .getByRole('button', { name: 'Copy the Messages request' })
        .click();
      const messages = await clipboard(admin);
      expect(messages).toContain(`${GATEWAY}/v1/messages`);
      expect(messages).toContain('anthropic-version: 2023-06-01');
    } finally {
      await stub.unroute();
    }
  });

  test('a model on the LLM endpoint: the public name, the copy yields the endpoint, requests send the public name', async ({
    admin,
  }) => {
    const stub = await stage(admin, true);
    try {
      await dropPersistedQueriesOnNextLoad(admin);
      await open(admin, SERVING);

      const grid = admin.getByRole('grid');
      const row = grid.getByRole('row', { name: /qwen-stub-api/ });
      await expect(
        row.getByText('model name qwen-stub-api'),
        'the public name next to the served id',
      ).toBeVisible();
      await admin
        .getByRole('button', { name: 'Copy endpoint' })
        .first()
        .click();
      expect(
        await clipboard(admin),
        'the copy yields the endpoint a client uses',
      ).toBe(LLM_ENDPOINT);

      await row
        .getByRole('button', { name: 'Show steps of model qwen-stub-api' })
        .click();
      const panel = admin.getByTestId('served-model-lifecycle');
      await expect(panel.getByTestId('served-model-public-name')).toContainText(
        'model qwen-stub-api on the LLM endpoint',
      );
      await expect(panel.getByTestId('served-model-config')).toContainText(
        'it reaches the model on the LLM endpoint as qwen-stub-api',
      );
      await panel
        .getByRole('button', { name: 'Copy the Chat completions request' })
        .click();
      const chat = await clipboard(admin);
      expect(chat).toContain(`curl -sS ${LLM_ENDPOINT}/v1/chat/completions`);
      expect(chat).toContain('"model":"qwen-stub-api"');
      expect(chat, 'the in-cluster listener checks no key').not.toContain(
        'Authorization',
      );
    } finally {
      await stub.unroute();
    }
  });
});
