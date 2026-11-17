import type { Page } from '@playwright/test';
import { expect, expectNoHorizontalScroll, open, test } from './fixtures';

/**
 * The Cost page's by-agent table tells a reader what a row is: an agent the
 * portal knows, an agent it no longer knows (marked as removed, unlinked, its
 * spend kept), or traffic the gateway could attribute to no caller
 * (giantswarm/backstage#2489).
 *
 * The gateway's three per-agent vectors — spend, tokens and model calls — are
 * answered at the browser, the way the GPU node pool and served-model specs
 * answer muster: a fresh lab has no traffic in the gateway's metrics, and
 * while an agent is producing some it still exists, so the removed and the
 * unattributed row cannot be brought about by using the lab. Every other
 * Mimir query goes through to the lab's Prometheus.
 */

const MODEL = 'lab-model';

/** An agent no `Agent` of the lab is named after. */
const REMOVED = { agent_namespace: 'kagent', agent: 'lab-removed-agent' };
/** The gateway's own value for a call it could attribute to no caller. */
const UNKNOWN = { agent_namespace: 'kagent', agent: 'unknown' };

type Series = { labels: Record<string, string>; value: number };

/** One Prometheus instant vector, as Mimir's query API answers it. */
function vector(series: Series[]) {
  const at = Math.floor(Date.now() / 1000);
  return {
    status: 'success',
    data: {
      resultType: 'vector',
      result: series.map(({ labels, value }) => ({
        metric: labels,
        value: [at, String(value)],
      })),
    },
  };
}

const perAgent = (
  labels: Record<string, string>,
  removed: number,
  unknown: number,
): Series[] => [
  { labels: { ...REMOVED, ...labels }, value: removed },
  { labels: { ...UNKNOWN, ...labels }, value: unknown },
];

/**
 * Answers the by-agent vectors of `llmUsageQueries` with a removed agent and
 * unattributed traffic; every other query is the lab's to answer.
 */
async function answerGatewayVectors(page: Page): Promise<void> {
  await page.route('**/api/gs/mimir/query?*', async route => {
    const query =
      new URL(route.request().url()).searchParams.get('query') ?? '';
    const priced = { gen_ai_response_model: MODEL, gen_ai_token_type: 'input' };
    let body;
    if (query.includes('agentgateway_gen_ai_client_cost_usd_total')) {
      body = vector(perAgent(priced, 6.6, 0.4));
    } else if (query.includes('agentgateway_gen_ai_client_token_usage_sum')) {
      body = vector(perAgent(priced, 660_000, 40_000));
    } else if (
      query.includes('agentgateway_gen_ai_server_request_duration_count')
    ) {
      body = vector(perAgent({ gen_ai_response_model: MODEL }, 66, 4));
    } else {
      await route.fallback();
      return;
    }
    await route.fulfill({ json: body });
  });
}

/** Column headers whose label is cut: wider than the room it has. */
async function squeezedHeaders(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('[role="columnheader"]')]
      .filter(header => {
        const label = header.querySelector('span') ?? header;
        return (
          label.textContent?.trim() && label.scrollWidth > label.clientWidth + 1
        );
      })
      .map(header => header.textContent?.trim() ?? ''),
  );
}

/** Tables that scroll sideways inside their card. */
async function scrollingTables(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      [...document.querySelectorAll('[role="grid"]')].filter(table => {
        const box = table.parentElement;
        return box !== null && box.scrollWidth > box.clientWidth + 1;
      }).length,
  );
}

/** The column headers of the card titled `title`. */
async function headersOf(page: Page, title: string): Promise<string[]> {
  const card = page
    .getByText(title, { exact: true })
    .locator('xpath=ancestor::*[.//*[@role="grid"]][1]');
  return (await card.getByRole('columnheader').allTextContents()).map(text =>
    text.trim(),
  );
}

/** The table row that carries `text` in its agent cell. */
function rowWith(page: Page, text: string) {
  return page
    .getByText(text, { exact: true })
    .locator('xpath=ancestor::*[@role="row"]');
}

test.describe('Usage → Cost, by agent', () => {
  test('a removed agent is marked as removed and unlinked; unattributed traffic reads as such', async ({
    admin,
  }) => {
    await answerGatewayVectors(admin);
    try {
      await open(admin, '/usage/cost');

      // The portal queries the lab's Prometheus only where the lab runs one
      // (`platform.observability`); without it the page says so instead.
      const byAgent = admin.getByText('By agent', { exact: true });
      const noObservability = admin.getByText(/has no observability stack/);
      await expect(
        byAgent.or(noObservability).first(),
        'the Cost page renders the by-agent table or says there is nothing to query',
      ).toBeVisible();
      test.skip(
        await noObservability.isVisible(),
        'the lab has no observability stack (platform.observability: false)',
      );

      const removed = rowWith(admin, 'kagent/lab-removed-agent');
      await expect(
        removed.getByText('Removed', { exact: true }),
        'the pair no agent matches is shown by its technical name, marked as removed',
      ).toBeVisible();
      await expect(
        removed.getByRole('link'),
        'a removed agent has no page to open',
      ).toHaveCount(0);
      await expect(
        removed.getByText('$6.60'),
        'its spend stays with the row',
      ).toBeVisible();

      const unattributed = rowWith(admin, 'Unattributed');
      await expect(unattributed).toBeVisible();
      await expect(
        unattributed.getByText('Removed', { exact: true }),
      ).toHaveCount(0);
      await expect(unattributed.getByRole('link')).toHaveCount(0);

      await expect(
        admin.getByText(/Removed marks an agent this portal no longer knows/),
        'the note under the table explains the mark',
      ).toBeVisible();
    } finally {
      await admin.unroute('**/api/gs/mimir/query?*');
    }
  });
});

// Layout check (table-fit): beside the side rail at 768px, and at 375px,
// five equal columns of the by-agent table cut "Share of spend" and "Model
// calls". Each column now has a minimum for its header and value, and a card
// too narrow for them shows the agent and its spend.
test('Usage → Cost keeps the by-agent headers and figures whole at tablet and phone width', async ({
  admin,
}) => {
  await answerGatewayVectors(admin);
  try {
    await admin.setViewportSize({ width: 1440, height: 900 });
    await open(admin, '/usage/cost');
    const byAgent = admin.getByText('By agent', { exact: true });
    const noObservability = admin.getByText(/has no observability stack/);
    await expect(byAgent.or(noObservability).first()).toBeVisible();
    test.skip(
      await noObservability.isVisible(),
      'the lab has no observability stack (platform.observability: false)',
    );
    await expect
      .poll(() => headersOf(admin, 'By agent'), 'By agent at 1440px')
      .toEqual(['Agent', 'Model calls', 'Tokens', 'Spend', 'Share of spend']);

    for (const width of [768, 375]) {
      await admin.setViewportSize({ width, height: 900 });
      await expect
        .poll(() => headersOf(admin, 'By agent'), `By agent at ${width}px`)
        .toEqual(['Agent', 'Spend']);
      // The table lays its columns out again a frame after the resize.
      await expect
        .poll(() => squeezedHeaders(admin), `no header cut at ${width}px`)
        .toEqual([]);
      await expect
        .poll(
          () => scrollingTables(admin),
          `no table scrolls sideways at ${width}px`,
        )
        .toBe(0);
      await expectNoHorizontalScroll(admin, `Usage → Cost at ${width}px`);
    }
  } finally {
    await admin.unroute('**/api/gs/mimir/query?*');
  }
});
