import type { Page, Route } from '@playwright/test';
import { expect, open, test } from './fixtures';
import { lab } from './lab';

/**
 * The home tells a failed agent read from an empty roster, and never shows a
 * roster older than the last read as the current one.
 *
 * The lab's reads succeed, so each failure is staged at the browser and
 * everything else is real: the cluster-wide Agents list through the portal's
 * Kubernetes proxy fails, or -- for the lab's developer, who reads kagent
 * namespace by namespace -- muster cannot say which namespaces agent-manager
 * puts agents in. The persisted caches are dropped before each load, so the
 * staged answer is the one the page reads.
 */

const CLUSTER_HEADER = 'backstage-kubernetes-cluster';
const AGENT_PLATFORM_CACHE = 'agent-platform-react-query-cache';
const readWait = 60_000;

/** The lab's Agent list request, cluster-wide or in one namespace. */
function isAgentList(route: Route, namespace?: string): boolean {
  // The proxy's paths end in a slash.
  const pathname = new URL(route.request().url()).pathname.replace(/\/$/, '');
  const list = namespace
    ? `/apis/api.kagent.dev/v1alpha3/namespaces/${namespace}/agents`
    : '/apis/api.kagent.dev/v1alpha3/agents';
  return (
    pathname.endsWith(list) &&
    route.request().headers()[CLUSTER_HEADER] === lab.installation
  );
}

async function dropPersistedCaches(page: Page): Promise<void> {
  await page.addInitScript(key => {
    window.localStorage.removeItem(key);
  }, AGENT_PLATFORM_CACHE);
}

const couldNotLoad = (page: Page) =>
  page.getByRole('heading', { name: "Couldn't load your agents" });
const noAgentsYet = (page: Page) =>
  page.getByRole('heading', { name: 'No agents yet' });
const prompt = (page: Page) => page.getByRole('textbox', { name: 'Prompt' });

test('a failed agent read shows an error with Retry, and Retry shows the agents', async ({
  labAgent: _labAgent,
  signInAs,
}) => {
  const page = await signInAs(lab.users.admin);
  await dropPersistedCaches(page);
  const failAgentList = async (route: Route) => {
    if (!isAgentList(route)) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      json: { error: { name: 'Error', message: 'staged failure' } },
    });
  };
  await page.route('**/api/kubernetes/proxy/**', failAgentList);

  await open(page, '/');

  await expect(couldNotLoad(page), 'the failed read is an error').toBeVisible({
    timeout: readWait,
  });
  await expect(noAgentsYet(page), 'never the empty roster').toHaveCount(0);
  await expect(
    page.getByText(/^Could not read 1 environment$/),
    'the warning below names where and why',
  ).toBeVisible();

  await page.unroute('**/api/kubernetes/proxy/**', failAgentList);
  await page.getByRole('button', { name: 'Retry' }).click();

  await expect(prompt(page), 'Retry reads the agents').toBeVisible({
    timeout: readWait,
  });
  await expect(couldNotLoad(page)).toHaveCount(0);
});

test('a namespaced reader whose agent namespaces muster cannot name sees the error, not No agents yet', async ({
  labAgent: _labAgent,
  signInAs,
}) => {
  const page = await signInAs(lab.users.dev);
  await dropPersistedCaches(page);
  // agent-manager's get_info, which names the namespaces agents land in.
  const failGetInfo = async (route: Route) => {
    const body = route.request().postDataJSON() as { name?: string } | null;
    if (!body?.name?.endsWith('get_info')) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 502,
      contentType: 'application/json',
      json: { error: { name: 'Error', message: 'staged failure' } },
    });
  };
  // Without the namespaces, only the platform namespace is read: staged
  // empty, as on an installation whose agents all live elsewhere.
  const emptyPlatformNamespace = async (route: Route) => {
    if (!isAgentList(route, 'kagent')) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: {
        apiVersion: 'api.kagent.dev/v1alpha3',
        kind: 'AgentList',
        metadata: {},
        items: [],
      },
    });
  };
  await page.route('**/api/muster/call**', failGetInfo);
  await page.route('**/api/kubernetes/proxy/**', emptyPlatformNamespace);

  await open(page, '/', lab.users.dev);

  await expect(couldNotLoad(page)).toBeVisible({ timeout: readWait });
  await expect(noAgentsYet(page)).toHaveCount(0);

  await page.unroute('**/api/muster/call**', failGetInfo);
  await page.unroute('**/api/kubernetes/proxy/**', emptyPlatformNamespace);
  await page.getByRole('button', { name: 'Retry' }).click();

  await expect(prompt(page), 'Retry reads the agents').toBeVisible({
    timeout: readWait,
  });
});

test('a load right after the agents changed shows them, not the empty list persisted before', async ({
  labAgent: _labAgent,
  signInAs,
}) => {
  test.setTimeout(3 * 60_000);
  const page = await signInAs(lab.users.admin);
  await open(page, '/');
  await expect(prompt(page)).toBeVisible({ timeout: readWait });

  // The persisted blob as a load half a minute earlier left it: the same
  // entries, the Agents list empty and written just now -- inside the minute
  // the cache trusts an entry for.
  await expect
    .poll(
      () =>
        page.evaluate(
          key => window.localStorage.getItem(key)?.includes('"agents"'),
          AGENT_PLATFORM_CACHE,
        ),
      { timeout: 60_000, message: 'the agents list is persisted' },
    )
    .toBe(true);
  const emptied = await page.evaluate(key => {
    const blob = JSON.parse(window.localStorage.getItem(key)!);
    let count = 0;
    for (const query of blob.clientState.queries) {
      const [scope, , kind, , , plural] = query.queryKey;
      if (scope === 'cluster' && kind === 'list' && plural === 'agents') {
        query.state.data = [];
        query.state.dataUpdatedAt = Date.now();
        count += 1;
      }
    }
    blob.timestamp = Date.now();
    window.localStorage.setItem(key, JSON.stringify(blob));
    return count;
  }, AGENT_PLATFORM_CACHE);
  expect(emptied, 'a persisted Agents list was staged empty').toBeGreaterThan(
    0,
  );

  await page.reload();

  await expect(prompt(page), 'the agents are read again').toBeVisible({
    timeout: readWait,
  });
  await expect(noAgentsYet(page)).toHaveCount(0);
});
