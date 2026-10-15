import type { Page, Route } from '@playwright/test';
import { expect, open, test } from './fixtures';
import { lab } from './lab';

/**
 * Customize › Agents explains a list that is empty or still incomplete: an
 * environment without kagent (and New agent disabled, with the reason), an
 * environment whose inventory probe was refused, and a list whose rows are in
 * while another environment is still being read.
 *
 * The lab runs kagent, answers its probe and is the only environment, so each
 * state is staged at the browser and everything else is real: the probe's
 * answer (`GET /apis` through the portal's Kubernetes proxy) loses the kagent
 * group or becomes a 403, or the signed-in config (`GET /api/gs/config`)
 * gains a second environment whose every request stays pending. The persisted
 * inventory is dropped before each load, so the staged answer is the one the
 * page reads.
 */

const CLUSTER_HEADER = 'backstage-kubernetes-cluster';
const KAGENT_GROUP = 'api.kagent.dev';
/** The second environment the loading-more test adds to the config. */
const SLOW_INSTALLATION = 'e2e-slow-environment';

/** Whether a request goes through the Kubernetes proxy to `installation`. */
function isClusterRequest(route: Route, installation: string): boolean {
  return (
    new URL(route.request().url()).pathname.includes(
      '/api/kubernetes/proxy/',
    ) && route.request().headers()[CLUSTER_HEADER] === installation
  );
}

/** Whether a request is the inventory probe (`GET /apis`) of `installation`. */
function isInventoryProbe(route: Route, installation: string): boolean {
  return (
    new URL(route.request().url()).pathname.endsWith(
      '/api/kubernetes/proxy/apis',
    ) && isClusterRequest(route, installation)
  );
}

/**
 * Drops the plugins' persisted react-query caches on every load of `page`,
 * before the app runs, so the inventory is probed again rather than read
 * from an earlier answer.
 */
async function dropPersistedCaches(page: Page): Promise<void> {
  await page.addInitScript(() => {
    ['agent-platform-react-query-cache', 'gs-react-query-cache'].forEach(key =>
      window.localStorage.removeItem(key),
    );
  });
}

test('an environment without kagent explains the empty list and disables New agent with the reason', async ({
  signInAs,
}) => {
  const page = await signInAs(lab.users.admin);
  await dropPersistedCaches(page);
  const stripped: string[] = [];
  await page.route('**/api/kubernetes/proxy/apis', async route => {
    if (!isInventoryProbe(route, lab.installation)) {
      await route.fallback();
      return;
    }
    const response = await route.fetch();
    const body = (await response.json()) as {
      groups?: { name: string }[];
    };
    stripped.push(route.request().url());
    await route.fulfill({
      response,
      json: {
        ...body,
        groups: (body.groups ?? []).filter(
          group => group.name !== KAGENT_GROUP,
        ),
      },
    });
  });

  await open(page, '/customize/agents');

  const card = page.getByRole('heading', {
    name: `kagent is not installed on ${lab.installation}`,
  });
  await expect(
    card,
    'the panel names the environment without kagent',
  ).toBeVisible({
    timeout: 60_000,
  });
  await expect(
    page.getByText(
      `Agents run on environments with kagent. Enable the Agent Platform on ${lab.installation} to create agents there.`,
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Go to Installations' }),
  ).toBeVisible();
  expect(
    stripped.length,
    'the probe was answered without kagent',
  ).toBeGreaterThan(0);

  await expect(
    page.getByRole('link', { name: 'New agent' }),
    'New agent no longer leads to a form with nowhere to deploy',
  ).toHaveCount(0);
  const newAgent = page.getByRole('button', { name: 'New agent' });
  await expect(newAgent).toBeDisabled();
  await expect(newAgent).toHaveAccessibleDescription(
    `kagent is not installed on ${lab.installation}. Enable the Agent Platform on ${lab.installation} to create agents there.`,
  );
  // The reason is also shown, not only announced: on hover of its wrapper.
  await newAgent.locator('..').hover();
  await expect(page.getByRole('tooltip')).toContainText(
    `kagent is not installed on ${lab.installation}`,
  );
});

test('an environment that refused its inventory probe shows the gate naming it, the 403 and the context', async ({
  signInAs,
}) => {
  const page = await signInAs(lab.users.admin);
  await dropPersistedCaches(page);
  await page.route('**/api/kubernetes/proxy/apis', async route => {
    if (!isInventoryProbe(route, lab.installation)) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      json: {
        kind: 'Status',
        apiVersion: 'v1',
        status: 'Failure',
        message: 'forbidden: User "admin@lab.local" cannot get path "/apis"',
        reason: 'Forbidden',
        code: 403,
      },
    });
  });

  await open(page, '/customize/agents');

  const gate = page.getByText(
    `The API server of ${lab.installation} refused to list its API groups`,
  );
  await expect(gate, 'the gate explains the refused probe').toBeVisible({
    timeout: 60_000,
  });
  await expect(gate).toContainText('403');
  await expect(gate).toContainText(
    `Ask the administrators of ${lab.installation} about your access.`,
  );
  await expect(
    page.getByText(
      'Which environments run kagent is read through their Kubernetes API.',
    ),
    'the gate says what the probe is for on this tab',
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'No agents yet' }),
    'the gate is the whole answer, not an invitation under it',
  ).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'No agents to list' }),
  ).toHaveCount(0);
});

test('rows in while another environment is still read show the loading-more bar over the list', async ({
  labAgent,
  signInAs,
}) => {
  const page = await signInAs(lab.users.admin);
  await dropPersistedCaches(page);
  // A second environment, cloned from the lab's: the home stays the lab
  // (the first entry with the main sign-in provider).
  await page.route('**/api/gs/config', async route => {
    const response = await route.fetch();
    const config = (await response.json()) as {
      gs: { installations: Record<string, Record<string, unknown>> };
    };
    const installations = config.gs.installations;
    await route.fulfill({
      response,
      json: {
        ...config,
        gs: {
          ...config.gs,
          installations: {
            ...installations,
            [SLOW_INSTALLATION]: { ...installations[lab.installation] },
          },
        },
      },
    });
  });
  // Every request to the second environment stays pending: it is still being
  // read for as long as the test looks.
  const held: Route[] = [];
  await page.route('**/api/kubernetes/proxy/**', async route => {
    if (isClusterRequest(route, SLOW_INSTALLATION)) {
      held.push(route);
      return;
    }
    await route.fallback();
  });

  await open(page, '/customize/agents');

  await expect(
    page.getByRole('link', { name: new RegExp(labAgent.name) }),
    'the lab’s rows are listed while the second environment is read',
  ).toBeVisible({ timeout: 60_000 });
  await expect(
    page.getByRole('progressbar', { name: 'Loading more agents' }),
    'a thin bar says more agents may still arrive',
  ).toBeVisible();
  expect(held.length, 'the second environment was asked').toBeGreaterThan(0);
});
