import type { Page, Route } from '@playwright/test';
import { expect, open, test, type LabAgent } from './fixtures';
import { lab } from './lab';

/**
 * The start screen names the default agent that cannot start sessions: its
 * environment and namespace, and why.
 *
 * The lab's default agent is ready, so the state is staged at the browser
 * around the worker's own agent and everything else is real: agent-manager's
 * `get_info` names that agent as the default, the Agent list reports it
 * failed (without its model, for the no-model case), and `get_agent` reads it
 * back as the platform's own agent without a model. The persisted caches are
 * dropped before each load, so the staged answers are the ones the page reads.
 */

const CLUSTER_HEADER = 'backstage-kubernetes-cluster';
const AGENT_PLATFORM_CACHE = 'agent-platform-react-query-cache';
const STAGED_FAILURE = 'staged failure of the default agent';
const readWait = 60_000;

/** The namespace of the worker's agent, from its detail page's path. */
function namespaceOf(agent: LabAgent): string {
  return agent.detailPath.split('/').slice(-2)[0];
}

async function dropPersistedCaches(page: Page): Promise<void> {
  await page.addInitScript(key => {
    window.localStorage.removeItem(key);
  }, AGENT_PLATFORM_CACHE);
}

type AgentItem = {
  metadata?: { name?: string; namespace?: string };
  spec?: { template?: { modelConfig?: unknown } };
  status?: { conditions?: { type: string; status: string }[] };
};

/**
 * Stages `agent` as the lab's failed default agent; `withoutModel` also drops
 * its model, and has agent-manager read it as the platform's own agent.
 */
async function stageFailedDefault(
  page: Page,
  agent: LabAgent,
  withoutModel: boolean,
): Promise<void> {
  const namespace = namespaceOf(agent);
  await page.route('**/api/kubernetes/proxy/**', async (route: Route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname.replace(/\/$/, '');
    if (
      request.method() !== 'GET' ||
      !pathname.endsWith('/agents') ||
      !pathname.includes('/apis/api.kagent.dev/') ||
      request.headers()[CLUSTER_HEADER] !== lab.installation
    ) {
      await route.fallback();
      return;
    }
    const response = await route.fetch();
    const body = (await response.json()) as { items?: AgentItem[] };
    const items = (body.items ?? []).map(item => {
      if (
        item.metadata?.name !== agent.slug ||
        item.metadata?.namespace !== namespace
      ) {
        return item;
      }
      const template = { ...item.spec?.template };
      if (withoutModel) {
        delete template.modelConfig;
      }
      return {
        ...item,
        spec: { ...item.spec, template },
        status: {
          ...item.status,
          conditions: (item.status?.conditions ?? []).map(condition => {
            if (condition.type === 'Accepted') {
              return {
                ...condition,
                status: 'False',
                reason: 'Staged',
                message: STAGED_FAILURE,
              };
            }
            if (condition.type === 'Ready') {
              return { ...condition, status: 'False', reason: 'Staged' };
            }
            return condition;
          }),
        },
      };
    });
    await route.fulfill({ response, json: { ...body, items } });
  });
  await page.route('**/api/muster/call**', async (route: Route) => {
    const call = route.request().postDataJSON() as {
      name?: string;
      arguments?: { namespace?: string; name?: string };
    } | null;
    if (call?.name?.endsWith('get_info')) {
      const answer = await (await route.fetch()).json();
      await route.fulfill({
        json: { ...answer, defaultAgent: `${namespace}/${agent.slug}` },
      });
      return;
    }
    if (
      withoutModel &&
      call?.name?.endsWith('get_agent') &&
      call.arguments?.namespace === namespace &&
      call.arguments?.name === agent.slug
    ) {
      const answer = await (await route.fetch()).json();
      await route.fulfill({
        json: {
          ...answer,
          modelConfig: undefined,
          ready: false,
          managed: 'platform',
          default: true,
        },
      });
      return;
    }
    await route.fallback();
  });
}

test('a default agent without a model names its environment and namespace, and links Models in the size of its text', async ({
  labAgent,
  signInAs,
}) => {
  const page = await signInAs(lab.users.admin);
  await dropPersistedCaches(page);
  await stageFailedDefault(page, labAgent, true);

  await open(page, '/');

  const title = page.getByText(`${labAgent.name} cannot start sessions`, {
    exact: true,
  });
  await expect(title).toBeVisible({ timeout: readWait });
  const alert = page.locator('.bui-Alert').filter({ has: title });
  const place = `${lab.installation}, namespace ${namespaceOf(labAgent)}`;
  await expect(alert).toContainText(
    `No model yet on ${place}. Add one under Models.`,
  );
  await expect(alert).toHaveAttribute('data-status', 'info');
  await expect(alert.getByRole('link', { name: place })).toHaveAttribute(
    'href',
    labAgent.detailPath,
  );

  const models = alert.getByRole('link', { name: 'Models', exact: true });
  const sizes = await models.evaluate(link => ({
    link: getComputedStyle(link).fontSize,
    text: getComputedStyle(link.parentElement!).fontSize,
  }));
  expect(sizes.link, 'the Models link is set like its sentence').toBe(
    sizes.text,
  );
});

test("a failed default agent with a model gives the controller's message, as a warning", async ({
  labAgent,
  signInAs,
}) => {
  const page = await signInAs(lab.users.admin);
  await dropPersistedCaches(page);
  await stageFailedDefault(page, labAgent, false);

  await open(page, '/');

  const title = page.getByText(`${labAgent.name} cannot start sessions`, {
    exact: true,
  });
  await expect(title).toBeVisible({ timeout: readWait });
  const alert = page.locator('.bui-Alert').filter({ has: title });
  await expect(alert).toContainText(
    `Failed on ${lab.installation}, namespace ${namespaceOf(
      labAgent,
    )}: ${STAGED_FAILURE}.`,
  );
  await expect(alert).not.toContainText('No model yet');
  await expect(alert).toHaveAttribute('data-status', 'warning');
});
