import { expect, openReadyAgent, startSessionButton, test } from './fixtures';
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

/**
 * Answers this Session's refusal query with one refusal of
 * `proxy.golang.org:443` a few seconds after the turn began, and records
 * every refusal query the page sends.
 */
async function answerRefusals(page: Page, queries: string[]): Promise<void> {
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
              metric: {
                scheme: 'https',
                host: 'proxy.golang.org',
                port: '443',
              },
              values: [
                [at, '2'],
                [at + 30, '2'],
              ],
            },
          ],
        },
      },
    });
  });
}

test('a session shows its egress refusals on the turn, and another person sees neither', async ({
  admin,
  labAgent,
  signInAs,
}) => {
  test.setTimeout(8 * 60_000);
  const queries: string[] = [];
  await answerRefusals(admin, queries);

  await openReadyAgent(admin, labAgent);
  await startSessionButton(admin).click();
  const promptBox = admin.getByRole('textbox', { name: 'Prompt' });
  await expect(promptBox).toBeVisible();
  await promptBox.fill('Say hello in one word.');
  await admin.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(admin).toHaveURL(
    new RegExp(`/sessions/${lab.installation}/[^/]+$`),
    { timeout: 60_000 },
  );
  const sessionPath = new URL(admin.url()).pathname;
  const actor = `session-${sessionIdOf(admin).toLowerCase()}`;

  // A lab without `platform.observability` configures the installation with
  // `mimirEnabled: false`: the page then sends no refusal query and shows the
  // Session without refusals, which is what this run can prove there.
  const signedInConfig = admin.waitForResponse(response =>
    response.url().endsWith('/api/gs/config'),
  );
  await admin.reload();
  const config = await (await signedInConfig).json();
  const hasMetrics =
    config?.gs?.installations?.[lab.installation]?.mimirEnabled !== false;

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
  await expect(entry).toContainText('Egress refused: proxy.golang.org:443');
  await expect(entry).toContainText(
    `Not in ${labAgent.name}’s egress settings`,
  );
  await expect(entry).toContainText('2 requests in this turn');
  await expect(entry).toContainText(
    'can add https://proxy.golang.org to its Extra egress origins',
  );
  await expect(
    entry.getByRole('link', { name: `${labAgent.name}’s egress settings` }),
  ).toHaveAttribute('href', `${labAgent.detailPath}/edit`);
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
