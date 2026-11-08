import type { Locator, Page, Route } from '@playwright/test';
import {
  expect,
  open,
  rosterLinkOf,
  rosterRowOf,
  searchRoster,
  test,
  type LabAgent,
} from './fixtures';

/**
 * Customize › Agents names each agent's Harness, and filters by it, only when
 * the list holds agents of more than one Harness. The lab runs every agent on
 * one, so the second is staged at the browser and everything else is real:
 * the roster's `AgentList` answer (`GET` through the portal's Kubernetes
 * proxy) gains a copy of the worker's own agent (`labAgent`) that names a
 * second Harness, or, for the single-Harness case, has every agent name the
 * worker's agent's Harness, whatever else a shared lab holds. The staged
 * Harness exists nowhere, so the row and the filter name it by its name.
 *
 * Both rows are found by a search for the worker's agent's slug, which the
 * copy's technical name carries too: a shared lab's other agents stay out of
 * the way of the rows and their paging.
 */

const rosterWait = 2 * 60_000;

/** The Harness no lab runs, which the staged copy names. */
const SECOND_HARNESS = 'e2e-second-harness';

/** The copy's display and technical names, derived from the worker's agent. */
function copyOf(agent: LabAgent) {
  return {
    name: `${agent.name} on a second Harness`,
    slug: `${agent.slug}-h2`,
  };
}

type KubeAgent = {
  metadata: {
    name: string;
    uid?: string;
    annotations?: Record<string, string>;
    [key: string]: unknown;
  };
  spec?: { harnessRef?: { name: string }; [key: string]: unknown };
  [key: string]: unknown;
};

/** What the staged answers saw of the worker's agent. */
type Staged = { harness?: string };

/**
 * Stages the roster's `AgentList` answers on `page`. `harnesses: 2` adds a
 * copy of `agent` on {@link SECOND_HARNESS}; `harnesses: 1` sets every agent
 * that names a Harness to `agent`'s. Returns what the answers carried for
 * `agent`, so the test can tell a staged answer from one that never came.
 */
async function stageHarnesses(
  page: Page,
  agent: LabAgent,
  harnesses: 1 | 2,
): Promise<Staged> {
  const staged: Staged = {};
  const copy = copyOf(agent);
  await page.route('**/api/kubernetes/proxy/**', async (route: Route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    const response = await route.fetch();
    const body = await response.json().catch(() => undefined);
    const items: KubeAgent[] | undefined =
      body?.kind === 'AgentList' ? body.items : undefined;
    const own = items?.find(item => item.metadata.name === agent.slug);
    const harness = own?.spec?.harnessRef?.name;
    if (!items || !own || !harness) {
      await route.fulfill({ response });
      return;
    }
    staged.harness = harness;
    const answer =
      harnesses === 2
        ? [
            ...items,
            {
              ...own,
              metadata: {
                ...own.metadata,
                name: copy.slug,
                uid: `${own.metadata.uid ?? 'e2e'}-h2`,
                annotations: {
                  ...own.metadata.annotations,
                  'ui.giantswarm.io/display-name': copy.name,
                },
              },
              spec: { ...own.spec, harnessRef: { name: SECOND_HARNESS } },
            },
          ]
        : items.map(item =>
            item.spec?.harnessRef
              ? {
                  ...item,
                  spec: { ...item.spec, harnessRef: { name: harness } },
                }
              : item,
          );
    await route.fulfill({ response, json: { ...body, items: answer } });
  });
  return staged;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A row's Harness fact: its tooltip is `Harness: <title> (<name>)` or `Harness: <name>`. */
function harnessFact(row: Locator): Locator {
  return row.getByTestId('agent-facts').locator('[title^="Harness: "]');
}

/** The tooltip of the Harness fact naming `harness`, with or without its title. */
function harnessTooltip(harness: string): RegExp {
  const name = escapeRegExp(harness);
  return new RegExp(`^Harness: (${name}|.+ \\(${name}\\))$`);
}

function harnessFilter(page: Page): Locator {
  return page.getByRole('button', { name: /^Filter by harness/ });
}

/** The filter's option for `harness`, labelled `<title> (<name>)` or `<name>`. */
function harnessOption(page: Page, harness: string): Locator {
  const name = escapeRegExp(harness);
  return page
    .getByRole('listbox')
    .getByRole('option', { name: new RegExp(`(^${name}|\\(${name}\\))`) });
}

test.describe('the Agents list’s Harness column and filter', () => {
  test('with two Harnesses, each row names its Harness and the filter narrows the list to one', async ({
    admin,
    labAgent,
  }) => {
    test.setTimeout(rosterWait + 60_000);
    const copy = copyOf(labAgent);
    const staged = await stageHarnesses(admin, labAgent, 2);
    await open(admin, '/customize/agents');
    await searchRoster(admin, labAgent.slug);
    await expect(
      rosterLinkOf(admin, labAgent.name),
      'the roster lists the fixture agent',
    ).toBeVisible({ timeout: rosterWait });
    await expect(
      rosterLinkOf(admin, copy.name),
      'the roster lists the staged copy',
    ).toBeVisible();
    expect(
      staged.harness,
      'the roster answer was staged with the fixture agent’s Harness',
    ).toBeTruthy();
    const labHarness = staged.harness!;

    // The column: every row names its own Harness.
    await expect(
      harnessFact(rosterRowOf(admin, labAgent.name)),
    ).toHaveAttribute('title', harnessTooltip(labHarness));
    const copyFact = harnessFact(rosterRowOf(admin, copy.name));
    await expect(copyFact).toHaveAttribute(
      'title',
      harnessTooltip(SECOND_HARNESS),
    );
    await expect(copyFact).toHaveText(SECOND_HARNESS);

    // The filter: all Harnesses until one is picked, and it lists both.
    const filter = harnessFilter(admin);
    await expect(filter).toBeVisible();
    await expect(filter).toContainText('All');
    await filter.click();
    await expect(admin.getByRole('listbox').getByRole('option')).toHaveCount(2);
    await expect(harnessOption(admin, labHarness)).toBeVisible();
    await harnessOption(admin, SECOND_HARNESS).click();
    await admin.keyboard.press('Escape');

    await expect(filter).toContainText(SECOND_HARNESS);
    await expect(
      rosterLinkOf(admin, copy.name),
      'the second Harness keeps its agent',
    ).toBeVisible();
    await expect(
      rosterLinkOf(admin, labAgent.name),
      'the fixture agent runs on another Harness',
    ).toHaveCount(0);

    // Clearing the filter brings every Harness's agents back.
    await admin
      .getByRole('group', { name: 'Filters' })
      .getByRole('button', { name: 'Clear filters' })
      .click();
    await expect(filter).toContainText('All');
    await expect(rosterLinkOf(admin, labAgent.name)).toBeVisible();
    await expect(rosterLinkOf(admin, copy.name)).toBeVisible();
  });

  test('with one Harness, neither the column nor the filter shows', async ({
    admin,
    labAgent,
  }) => {
    test.setTimeout(rosterWait + 60_000);
    const staged = await stageHarnesses(admin, labAgent, 1);
    await open(admin, '/customize/agents');
    await searchRoster(admin, labAgent.slug);
    const row = rosterRowOf(admin, labAgent.name);
    await expect(row, 'the roster lists the fixture agent').toBeVisible({
      timeout: rosterWait,
    });
    expect(
      staged.harness,
      'the roster answer was staged with the fixture agent’s Harness',
    ).toBeTruthy();

    await expect(
      harnessFact(row),
      'one Harness for every agent: no row names it',
    ).toHaveCount(0);
    await expect(row.getByTestId('agent-facts')).not.toContainText(
      staged.harness!,
    );
    await expect(
      harnessFilter(admin),
      'one Harness for every agent: nothing to filter by',
    ).toHaveCount(0);
  });
});
