import type { Page, Route } from '@playwright/test';
import { expect, open, test } from './fixtures';
import { lab } from './lab';
import {
  dropPersistedQueriesOnNextLoad,
  installPersistedQueryDrop,
} from './model-manager.fixture';

/**
 * The installation inventory (`GET /apis`, where the KServe verdict comes
 * from) lives in the gs plugin's own persisted query cache, kept for an hour;
 * the drop in `model-manager.fixture` clears the agent-platform plugin's cache
 * alone. This clears the inventory's on the same one-shot flag, so the staged
 * `/apis` is asked on the next load — and the lab's real answer again after.
 */
const GS_PERSISTER_KEY = 'gs-react-query-cache';
const DROP_INVENTORY_FLAG = 'e2e-drop-inventory-cache';

async function installInventoryCacheDrop(page: Page): Promise<void> {
  await page.addInitScript(
    ([key, flag]) => {
      if (window.sessionStorage.getItem(flag)) {
        window.sessionStorage.removeItem(flag);
        window.localStorage.removeItem(key);
      }
    },
    [GS_PERSISTER_KEY, DROP_INVENTORY_FLAG] as const,
  );
}

async function dropInventoryCacheOnNextLoad(page: Page): Promise<void> {
  await page.evaluate(
    flag => window.sessionStorage.setItem(flag, '1'),
    DROP_INVENTORY_FLAG,
  );
}

/**
 * The KServe serving source on an `LLMInferenceService`
 * (giantswarm/backstage#2475): the portal reads the objects of KServe's llm-d
 * control plane, their workload pods and the model-serving discovery document
 * with the person's token through the Kubernetes proxy, and lists a served
 * model as a row of the KServe group — Ready, named after the object, placed
 * on its workload's node, the name it is served under as its model — whose
 * _Stop serving…_ deletes the object with the person's RBAC.
 *
 * **The cluster's answers are stubbed at the browser**; the lab runs no
 * KServe. The four reads the source makes through the proxy — the API group
 * list (`GET /apis`, where the installation inventory looks for
 * `serving.kserve.io`), the `llminferenceservices` list, the workload pods by
 * the controller's label and the discovery ConfigMap — are answered here in
 * the shapes KServe 0.20 and the connectivity chart produce. Everything else
 * (the sign-in, the nodes, the SelfSubjectAccessReview behind Stop serving,
 * model-manager's own backend) reaches the lab. Nothing is written: the
 * confirm is cancelled, and a DELETE would fail the test.
 */

const SERVING = '/agent-platform/models/serving';
const NAME = 'qwen3-4b-instruct';
const NAMESPACE = 'model-serving';
const MODEL = 'Qwen/Qwen3-4B-Instruct-2507';
const ROUTE = `https://models.lab.example/${NAMESPACE}/${NAME}`;
const WORKLOAD_SELECTOR = 'app.kubernetes.io/part-of=llminferenceservice';

/** The object model-manager composed from the preset, Ready, routed on the models Gateway. */
const object = {
  apiVersion: 'serving.kserve.io/v1alpha2',
  kind: 'LLMInferenceService',
  metadata: {
    name: NAME,
    namespace: NAMESPACE,
    uid: 'e2e-llmisvc-1',
    generation: 1,
    resourceVersion: '1',
    creationTimestamp: '2026-09-18T20:00:00Z',
    labels: {
      'app.kubernetes.io/managed-by': 'model-manager',
      'agent-platform.giantswarm.io/preset': NAME,
    },
  },
  spec: {
    model: { uri: `hf://${MODEL}`, name: MODEL },
    replicas: 1,
    router: { route: {} },
    template: {
      containers: [
        { name: 'main', resources: { requests: { 'nvidia.com/gpu': '1' } } },
      ],
    },
  },
  status: {
    observedGeneration: 1,
    url: ROUTE,
    addresses: [{ url: ROUTE }],
    conditions: [
      { type: 'PresetsCombined', status: 'True' },
      { type: 'WorkloadsReady', status: 'True' },
      { type: 'RouterReady', status: 'True' },
      {
        type: 'Ready',
        status: 'True',
        lastTransitionTime: '2026-09-18T20:05:00Z',
      },
    ],
  },
};

/** Its workload pod, as the controller labels the pods it derives. */
const workloadPod = {
  apiVersion: 'v1',
  kind: 'Pod',
  metadata: {
    name: `${NAME}-kserve-7d9f8b6c4-x2k9p`,
    namespace: NAMESPACE,
    uid: 'e2e-pod-1',
    labels: {
      'app.kubernetes.io/part-of': 'llminferenceservice',
      'app.kubernetes.io/name': NAME,
      'kserve.io/component': 'workload',
    },
  },
  spec: {
    nodeName: 'gpu-node-1',
    containers: [
      { name: 'main', resources: { requests: { 'nvidia.com/gpu': '1' } } },
    ],
  },
  status: { phase: 'Running' },
};

/** The discovery document the connectivity chart publishes for the serving slice. */
const discoveryConfigMap = {
  apiVersion: 'v1',
  kind: 'ConfigMap',
  metadata: {
    name: 'agent-platform-model-serving',
    namespace: 'agent-platform',
    uid: 'e2e-cm-1',
    labels: { 'agent-platform.giantswarm.io/model-serving-config': 'true' },
  },
  data: {
    'config.yaml': `apiVersion: agent-platform.giantswarm.io/v1alpha1
kind: ModelServingConfig
spec:
  namespace: ${NAMESPACE}
  gpuResourceName: nvidia.com/gpu
  gateway:
    enabled: true
    name: models
    namespace: agent-platform
    endpoint: https://models.lab.example
    pathConvention: /<namespace>/<model>/v1
  presets:
    namespace: agent-platform
    labelSelector: agent-platform.giantswarm.io/serving-preset=true
`,
  },
};

type Stub = { deletes: string[]; unstage: () => Promise<void> };

/**
 * Answer the KServe reads of the lab installation at the browser; every other
 * proxy request reaches the lab. Matched on the proxy's path and the
 * installation header, so the stubs never touch another installation's reads.
 */
async function stageKServe(page: Page): Promise<Stub> {
  const deletes: string[] = [];
  const forLab = (route: Route) =>
    route.request().headers()['backstage-kubernetes-cluster'] ===
    lab.installation;
  const proxyPath = (route: Route) => {
    const url = new URL(route.request().url());
    const index = url.pathname.indexOf('/api/kubernetes/proxy');
    // The list reads end in a slash (`…/llminferenceservices/`); compare
    // without it.
    return index === -1
      ? undefined
      : {
          path: url.pathname
            .slice(index + '/api/kubernetes/proxy'.length)
            .replace(/\/$/, ''),
          url,
        };
  };

  await installPersistedQueryDrop(page);
  await installInventoryCacheDrop(page);
  const handler = async (route: Route) => {
    const proxied = proxyPath(route);
    if (!proxied || !forLab(route)) {
      await route.fallback();
      return;
    }
    const { path, url } = proxied;
    const method = route.request().method();

    if (method === 'DELETE' && path.includes('/llminferenceservices/')) {
      deletes.push(path);
      await route.fulfill({ status: 500, json: { message: 'e2e: refused' } });
      return;
    }
    if (method !== 'GET') {
      await route.fallback();
      return;
    }
    // The inventory probe: the lab's groups, plus the llm-d control plane's.
    if (path === '/apis') {
      const response = await route.fetch();
      const groups = (await response.json()) as {
        groups: { name: string }[];
      };
      groups.groups.push({
        name: 'serving.kserve.io',
        versions: [
          { groupVersion: 'serving.kserve.io/v1alpha2', version: 'v1alpha2' },
        ],
        preferredVersion: {
          groupVersion: 'serving.kserve.io/v1alpha2',
          version: 'v1alpha2',
        },
      } as { name: string });
      await route.fulfill({ response, json: groups });
      return;
    }
    if (path === '/apis/serving.kserve.io/v1alpha2/llminferenceservices') {
      await route.fulfill({
        json: {
          apiVersion: 'serving.kserve.io/v1alpha2',
          kind: 'LLMInferenceServiceList',
          metadata: { resourceVersion: '1' },
          items: [object],
        },
      });
      return;
    }
    if (
      path === '/api/v1/pods' &&
      url.searchParams.get('labelSelector') === WORKLOAD_SELECTOR
    ) {
      await route.fulfill({
        json: {
          apiVersion: 'v1',
          kind: 'PodList',
          metadata: { resourceVersion: '1' },
          items: [workloadPod],
        },
      });
      return;
    }
    if (
      path === '/api/v1/configmaps' &&
      url.searchParams
        .get('labelSelector')
        ?.includes('agent-platform.giantswarm.io/model-serving-config')
    ) {
      await route.fulfill({
        json: {
          apiVersion: 'v1',
          kind: 'ConfigMapList',
          metadata: { resourceVersion: '1' },
          items: [discoveryConfigMap],
        },
      });
      return;
    }
    await route.fallback();
  };
  await page.route('**/api/kubernetes/proxy/**', handler);
  return {
    deletes,
    unstage: async () => {
      await page.unroute('**/api/kubernetes/proxy/**', handler);
      // Leave the page on the lab's real serving layer, the staged answers
      // — the inventory's KServe verdict among them — gone.
      await dropPersistedQueriesOnNextLoad(page);
      await dropInventoryCacheOnNextLoad(page);
      await page.goto(SERVING);
    },
  };
}

test.describe('serving: an LLMInferenceService read as a CR', () => {
  test('lists the served model as a KServe row and offers to stop it by deleting the object', async ({
    admin,
  }) => {
    const staged = await stageKServe(admin);
    try {
      await dropPersistedQueriesOnNextLoad(admin);
      await dropInventoryCacheOnNextLoad(admin);
      await open(admin, SERVING);

      const row = admin.getByRole('row', { name: new RegExp(NAME) });
      await expect(
        row,
        'the LLMInferenceService is a row of the KServe group',
      ).toBeVisible({ timeout: 60_000 });
      await expect(row.getByText('Ready', { exact: true })).toBeVisible();
      await expect(
        row.getByText(MODEL, { exact: true }),
        'the name it is served under is its model',
      ).toBeVisible();
      await expect(
        row.getByText('gpu-node-1', { exact: true }),
        'placed on its workload pod’s node',
      ).toBeVisible();

      await row.getByRole('button', { name: `Actions for ${NAME}` }).click();
      await admin.getByRole('menuitem', { name: 'Stop serving…' }).click();

      const dialog = admin.getByRole('dialog', {
        name: `Stop serving "${NAME}"?`,
      });
      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByText(
          new RegExp(
            `The LLMInferenceService ${NAME} in ${NAMESPACE} on ${lab.installation} is deleted`,
          ),
        ),
        'the object is deleted with the person’s own RBAC: model-manager does not operate this row',
      ).toBeVisible();
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(dialog).toBeHidden();

      expect(staged.deletes, 'nothing was deleted').toEqual([]);
    } finally {
      await staged.unstage();
    }
  });
});
