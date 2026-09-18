import type { Page } from '@playwright/test';
import { expect, open, test } from './fixtures';

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

/** An agent no `AgentTemplate` of the lab is named after. */
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
      await open(admin, '/agent-platform/usage/cost');

      await expect(
        admin.getByText('By agent', { exact: true }),
        'the by-agent table renders (the lab has observability on, so the portal queries its Prometheus)',
      ).toBeVisible();

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
        admin.getByText(
          /An agent marked as removed matches none this portal knows/,
        ),
        'the note under the table explains the mark',
      ).toBeVisible();
    } finally {
      await admin.unroute('**/api/gs/mimir/query?*');
    }
  });
});
