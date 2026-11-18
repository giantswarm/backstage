import {
  expect,
  openReadyAgent,
  startSessionButton,
  test,
  type LabAgent,
} from './fixtures';
import { lab } from './lab';
import type { Page } from '@playwright/test';

/**
 * A Session's egress refusals on its turn (giantswarm/giantswarm#38666).
 *
 * The egress gateway counts each refusal per actor and destination
 * (`agentgateway_atenet_egress_refusals_total`), and the session page reads its
 * own actor's series from the installation's metrics. **The metrics answer is
 * stubbed at the browser**: a refusal needs an agent whose model runs a
 * command against an undeclared host, which a model does not do on demand.
 * The session, its turn and the person's access are the lab's own. The stub
 * answers only a query for this Session's actor, so the test also proves the
 * page asks for no one else's.
 */

test.describe.configure({ mode: 'serial' });

const METRIC = 'agentgateway_atenet_egress_refusals_total';

/** The Session's id, from its page's URL. */
function sessionIdOf(page: Page): string {
  return new URL(page.url()).pathname.split('/').pop() ?? '';
}

type Destination = { scheme: string; host: string; port: string };

const PROXY: Destination = {
  scheme: 'https',
  host: 'proxy.golang.org',
  port: '443',
};
/** `ssh -T git@github.com`: raw TCP, which no egress setting can allow. */
const GITHUB_SSH: Destination = {
  scheme: 'tcp',
  host: 'github.com',
  port: '22',
};

/**
 * Answers this Session's refusal query with refusals of `destination` a few
 * seconds after the turn began (two, or `count`), and records every refusal
 * query the page sends.
 */
async function answerRefusals(
  page: Page,
  queries: string[],
  destination: Destination = PROXY,
  count = 2,
): Promise<void> {
  await page.route('**/api/gs/mimir/query_range?*', async route => {
    const url = new URL(route.request().url());
    const query = url.searchParams.get('query') ?? '';
    if (!query.includes(METRIC)) {
      await route.fallback();
      return;
    }
    queries.push(query);
    const actor = `session-${sessionIdOf(page).toLowerCase()}`;
    if (!query.includes(`ate_actor_name="${actor}"`)) {
      await route.fulfill({
        json: { status: 'success', data: { resultType: 'matrix', result: [] } },
      });
      return;
    }
    const at = Math.floor(Date.now() / 1000) - 30;
    await route.fulfill({
      json: {
        status: 'success',
        data: {
          resultType: 'matrix',
          result: [
            {
              metric: destination,
              values: [
                [at, String(count)],
                [at + 30, String(count)],
              ],
            },
          ],
        },
      },
    });
  });
}

/** Starts a Session with the lab agent and answers its page's path. */
async function startSession(page: Page, agent: LabAgent): Promise<string> {
  await openReadyAgent(page, agent);
  await startSessionButton(page).click();
  const promptBox = page.getByRole('textbox', { name: 'Prompt' });
  await expect(promptBox).toBeVisible();
  await promptBox.fill('Say hello in one word.');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`/sessions/${lab.installation}/[^/]+$`),
    { timeout: 60_000 },
  );
  return new URL(page.url()).pathname;
}

/**
 * Reloads the Session's page and answers whether the installation has
 * metrics. A lab without `platform.observability` configures the installation
 * with `mimirEnabled: false`: the page then sends no refusal query and shows
 * the Session without refusals, which is what a run can prove there.
 */
async function reloadForMetrics(page: Page): Promise<boolean> {
  const signedInConfig = page.waitForResponse(response =>
    response.url().endsWith('/api/gs/config'),
  );
  await page.reload();
  const config = await (await signedInConfig).json();
  return config?.gs?.installations?.[lab.installation]?.mimirEnabled !== false;
}

test('a session shows its egress refusals on the turn, and another person sees neither', async ({
  admin,
  labAgent,
  signInAs,
}) => {
  test.setTimeout(8 * 60_000);
  const queries: string[] = [];
  await answerRefusals(admin, queries);

  const sessionPath = await startSession(admin, labAgent);
  const actor = `session-${sessionIdOf(admin).toLowerCase()}`;
  const hasMetrics = await reloadForMetrics(admin);

  const entry = admin.getByTestId('timeline-egress-refused');
  if (!hasMetrics) {
    await expect(admin.getByText(/^Turn 1\b/).first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(entry).toHaveCount(0);
    expect(queries).toEqual([]);
  }
  test.skip(
    !hasMetrics,
    `${lab.installation} has no metrics (mimirEnabled: false): no refusal to show`,
  );
  await expect(entry).toBeVisible({ timeout: 120_000 });
  await expect(entry).toContainText(
    'Outgoing connection to proxy.golang.org blocked',
  );
  await expect(entry).toContainText(
    `${labAgent.name} is not allowed to reach this address`,
  );
  await expect(entry).toContainText('2 attempts');
  // The lab agent runs on the platform (kagent) Harness and the admin edits
  // it, so the remedy is its edit page, once agent-manager has read it.
  await expect(entry).toContainText(
    `add https://proxy.golang.org to ${labAgent.name}’s Extra egress origins`,
    { timeout: 30_000 },
  );
  await expect(
    entry.getByRole('link', { name: `Edit ${labAgent.name}`, exact: true }),
  ).toHaveAttribute('href', `${labAgent.detailPath}/edit`);
  // The port and the origin are folded.
  await entry.getByRole('button', { name: 'Technical details' }).click();
  await expect(entry).toContainText('proxy.golang.org:443 (https)');
  expect(queries.length).toBeGreaterThan(0);
  for (const query of queries) {
    expect(query).toContain(`ate_actor_name="${actor}"`);
  }

  // Another person: kagent does not show them the Session, so the page asks
  // for no refusals.
  const dev = await signInAs(lab.users.dev);
  const devQueries: string[] = [];
  await answerRefusals(dev, devQueries);
  await dev.goto(sessionPath);
  await expect(dev.getByText('Session not found')).toBeVisible({
    timeout: 60_000,
  });
  await expect(dev.getByTestId('timeline-egress-refused')).toHaveCount(0);
  expect(devQueries).toEqual([]);
});

test('a raw TCP refusal says no egress setting can allow it, with no link, and reads nothing of the agent', async ({
  admin,
  labAgent,
}) => {
  test.setTimeout(8 * 60_000);
  const queries: string[] = [];
  await answerRefusals(admin, queries, GITHUB_SSH, 1);
  // The remedy for raw TCP needs nothing of the agent, so the page asks
  // agent-manager nothing for it (giantswarm/giantswarm#38814).
  const agentReads: string[] = [];
  await admin.route('**/api/muster/call**', async route => {
    const call = route.request().postDataJSON() as { name?: string };
    if (call?.name === 'x_agent-manager_get_agent') {
      agentReads.push(call.name);
    }
    await route.fallback();
  });

  await startSession(admin, labAgent);
  const hasMetrics = await reloadForMetrics(admin);
  test.skip(
    !hasMetrics,
    `${lab.installation} has no metrics (mimirEnabled: false): no refusal to show`,
  );
  const entry = admin.getByTestId('timeline-egress-refused');
  await expect(entry).toBeVisible({ timeout: 120_000 });
  await expect(entry).toContainText(
    'Outgoing connection to github.com blocked',
  );
  await expect(entry).toContainText(
    'Raw TCP connections are not available to agents',
  );
  await expect(entry).toContainText('1 attempt');
  await expect(entry).toContainText(
    `No egress setting can allow it. If github.com offers HTTPS, have ${labAgent.name} use that instead.`,
  );
  // The lab agent is the admin's to edit on the platform Harness, which for
  // an HTTPS refusal offers its edit page: raw TCP offers none, nor any link.
  await expect(entry).not.toContainText('Extra egress origins');
  await expect(entry).not.toContainText('platform team');
  await expect(entry.getByRole('link')).toHaveCount(0);
  await entry.getByRole('button', { name: 'Technical details' }).click();
  await expect(entry).toContainText('github.com:22 (tcp)');
  expect(agentReads).toEqual([]);
});
