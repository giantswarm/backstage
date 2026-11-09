import type { Locator, Page, Route } from '@playwright/test';
import { expect, open, rosterLinkOf, rosterRowOf, test } from './fixtures';
import { RUN } from './lab';

/**
 * Customize › Agents names each agent's Harness, and filters by it, only when
 * the list holds agents of more than one Harness. A default lab runs every
 * agent on one, so the Harnesses are staged at the browser and everything
 * else is real: the roster's `AgentList` answer (`GET` through the portal's
 * Kubernetes proxy) gains two agents of this run, and every agent in it names
 * one of two Harnesses no lab runs — both on the first for the single-Harness
 * case, the second agent on the second Harness otherwise. Staging every agent,
 * a shared lab's own included, keeps the Harness count exact whatever the lab
 * holds. The staged Harnesses exist nowhere, so the rows and the filter name
 * them by their names.
 *
 * The staged agents carry the run in their names, and the list is searched
 * for it: a shared lab's other agents stay out of the way of the rows and
 * their paging. No agent is created, so no wizard, model or organization of
 * the lab is involved.
 */

const rosterWait = 2 * 60_000;

const FIRST_HARNESS = 'e2e-harness-one';
const SECOND_HARNESS = 'e2e-harness-two';

/** What the search narrows the list to: both staged agents and nothing else. */
const SEARCH = `e2e-harness-${RUN}`;

/** The staged agents: the first always on the first Harness. */
const AGENTS = [
  { slug: `${SEARCH}-a`, name: `E2E Harness ${RUN} A` },
  { slug: `${SEARCH}-b`, name: `E2E Harness ${RUN} B` },
] as const;

type KubeAgent = {
  spec?: { harnessRef?: { name: string }; [key: string]: unknown };
  [key: string]: unknown;
};

/** The namespace an `AgentList` request reads, or `undefined` for all of them. */
function namespaceOf(route: Route): string | undefined {
  const match = new URL(route.request().url()).pathname.match(
    /\/namespaces\/([^/]+)\/agents$/,
  );
  return match?.[1];
}

/**
 * Stages the roster's `AgentList` answers on `page`: every agent names
 * {@link FIRST_HARNESS}, and the first list answered — the same one on every
 * poll — gains the two {@link AGENTS}, the second on {@link SECOND_HARNESS}
 * when `harnesses` is 2. Returns the answers staged so far, so the test can
 * tell a staged list from one that never came.
 */
async function stageHarnesses(
  page: Page,
  harnesses: 1 | 2,
): Promise<{ count: number }> {
  const staged = { count: 0 };
  let carrier: string | undefined;
  await page.route('**/api/kubernetes/proxy/**', async (route: Route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    const response = await route.fetch();
    const body = await response.json().catch(() => undefined);
    if (body?.kind !== 'AgentList' || !Array.isArray(body.items)) {
      await route.fulfill({ response });
      return;
    }
    const path = new URL(route.request().url()).pathname;
    carrier ??= path;
    const items: KubeAgent[] = body.items.map((item: KubeAgent) => ({
      ...item,
      spec: { ...item.spec, harnessRef: { name: FIRST_HARNESS } },
    }));
    if (path === carrier) {
      const namespace =
        namespaceOf(route) ??
        (body.items[0]?.metadata?.namespace as string | undefined) ??
        'kagent';
      const kind = String(body.kind).replace(/List$/, '');
      AGENTS.forEach((agent, index) => {
        items.push({
          apiVersion: body.apiVersion,
          kind,
          metadata: {
            name: agent.slug,
            namespace,
            uid: `${agent.slug}-uid`,
            creationTimestamp: new Date().toISOString(),
            annotations: { 'ui.giantswarm.io/display-name': agent.name },
          },
          spec: {
            description: 'Staged by agents-harness-column.spec.ts.',
            harnessRef: {
              name:
                harnesses === 2 && index === 1 ? SECOND_HARNESS : FIRST_HARNESS,
            },
          },
        });
      });
      staged.count += 1;
    }
    await route.fulfill({ response, json: { ...body, items } });
  });
  return staged;
}

/** A row's Harness fact: its tooltip is `Harness: <name>`. */
function harnessFact(row: Locator): Locator {
  return row.getByTestId('agent-facts').locator('[title^="Harness: "]');
}

/** The filter's trigger, named by its value and then its field: "All Filter by harness". */
function harnessFilter(page: Page): Locator {
  return page.getByRole('button', { name: /\bFilter by harness$/ });
}

function harnessOption(page: Page, harness: string): Locator {
  return page
    .getByRole('listbox')
    .getByRole('option', { name: new RegExp(`^${harness}\\b`) });
}

async function openStagedRoster(page: Page) {
  await open(page, '/customize/agents');
  await page.getByRole('searchbox', { name: 'Search agents' }).fill(SEARCH);
  await expect(
    rosterLinkOf(page, AGENTS[0].name),
    'the roster lists the staged agents',
  ).toBeVisible({ timeout: rosterWait });
  await expect(rosterLinkOf(page, AGENTS[1].name)).toBeVisible();
}

test.describe('the Agents list’s Harness column and filter', () => {
  test('with two Harnesses, each row names its Harness and the filter narrows the list to one', async ({
    admin,
  }) => {
    test.setTimeout(rosterWait + 60_000);
    const staged = await stageHarnesses(admin, 2);
    await openStagedRoster(admin);
    expect(staged.count, 'the roster answer was staged').toBeGreaterThan(0);

    // The column: every row names its own Harness.
    const [first, second] = AGENTS.map(agent =>
      harnessFact(rosterRowOf(admin, agent.name)),
    );
    await expect(first).toHaveText(FIRST_HARNESS);
    await expect(first).toHaveAttribute('title', `Harness: ${FIRST_HARNESS}`);
    await expect(second).toHaveText(SECOND_HARNESS);
    await expect(second).toHaveAttribute('title', `Harness: ${SECOND_HARNESS}`);

    // The filter: all Harnesses until one is picked, and it lists both.
    const filter = harnessFilter(admin);
    await expect(filter).toBeVisible();
    await expect(filter).toContainText('All');
    await filter.click();
    await expect(admin.getByRole('listbox').getByRole('option')).toHaveCount(2);
    await expect(harnessOption(admin, FIRST_HARNESS)).toBeVisible();
    await harnessOption(admin, SECOND_HARNESS).click();
    await admin.keyboard.press('Escape');

    await expect(filter).toContainText(SECOND_HARNESS);
    await expect(
      rosterLinkOf(admin, AGENTS[1].name),
      'the second Harness keeps its agent',
    ).toBeVisible();
    await expect(
      rosterLinkOf(admin, AGENTS[0].name),
      'the first Harness’s agent is filtered out',
    ).toHaveCount(0);

    // Clearing the filter brings every Harness's agents back.
    await admin
      .getByRole('group', { name: 'Filters' })
      .getByRole('button', { name: 'Clear filters' })
      .click();
    await expect(filter).toContainText('All');
    await expect(rosterLinkOf(admin, AGENTS[0].name)).toBeVisible();
    await expect(rosterLinkOf(admin, AGENTS[1].name)).toBeVisible();
  });

  test('with one Harness, neither the column nor the filter shows', async ({
    admin,
  }) => {
    test.setTimeout(rosterWait + 60_000);
    const staged = await stageHarnesses(admin, 1);
    await openStagedRoster(admin);
    expect(staged.count, 'the roster answer was staged').toBeGreaterThan(0);

    for (const agent of AGENTS) {
      const row = rosterRowOf(admin, agent.name);
      await expect(
        harnessFact(row),
        'one Harness for every agent: no row names it',
      ).toHaveCount(0);
      await expect(row.getByTestId('agent-facts')).not.toContainText(
        FIRST_HARNESS,
      );
    }
    await expect(
      harnessFilter(admin),
      'one Harness for every agent: nothing to filter by',
    ).toHaveCount(0);
  });
});
