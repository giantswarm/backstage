import type { Page } from '@playwright/test';
import { expect, open, test } from './fixtures';

/**
 * The Cost page's roll-up by organization (giantswarm/backstage#2672, slice 8
 * of the agent-permissions plan): one row per organization the gateway
 * recorded calls for, the platform's shared agents under None, unattributed
 * traffic as its own row; an Organization select in the scope bar that
 * narrows every figure to one organization and travels in the URL; a row of
 * the table that opens that narrowed view.
 *
 * The gateway's three per-agent vectors (spend, tokens, model calls) are
 * answered at the browser, as `usage-cost.spec.ts` answers them: a fresh lab
 * has no traffic in two organization namespaces. The stub honours the
 * organization matcher the narrowed queries carry, so the narrowed page shows
 * only that organization's rows, as the gateway would answer. Every other
 * Mimir query goes through to the lab's Prometheus.
 */

const MODEL = 'lab-model';

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

/** The agents of the stubbed window, by the pair the gateway labels them with. */
const AGENTS = [
  { agent_namespace: 'org-alpha', agent: 'alpha-planner' },
  { agent_namespace: 'org-alpha', agent: 'alpha-reviewer' },
  { agent_namespace: 'org-beta', agent: 'beta-bot' },
  { agent_namespace: 'kagent', agent: 'platform-agent' },
  { agent_namespace: 'unknown', agent: 'unknown' },
];

/** Spend, tokens and calls per agent, in the order of {@link AGENTS}. */
const SPEND = [4, 2, 3, 1, 0.5];
const TOKENS = [400_000, 200_000, 300_000, 100_000, 50_000];
const CALLS = [40, 20, 30, 10, 5];

/** The organization matcher a narrowed query carries, if any. */
function narrowedTo(query: string): string | undefined {
  return /agent_namespace="([^"]+)"/.exec(query)?.[1];
}

function perAgent(
  values: number[],
  labels: Record<string, string>,
  only: string | undefined,
): Series[] {
  return AGENTS.map((agent, index) => ({
    labels: { ...agent, ...labels },
    value: values[index],
  })).filter(
    series => only === undefined || series.labels.agent_namespace === only,
  );
}

/**
 * Answers the agent-labelled vectors of `llmUsageQueries` for two
 * organizations, the platform and unattributed traffic, narrowed as the
 * query asks; the organizations-seen query (a count over the token metric)
 * gets the same series, whose namespaces are all it reads.
 */
async function answerGatewayVectors(page: Page): Promise<void> {
  await page.route('**/api/gs/mimir/query?*', async route => {
    const query =
      new URL(route.request().url()).searchParams.get('query') ?? '';
    const only = narrowedTo(query);
    const priced = { gen_ai_response_model: MODEL, gen_ai_token_type: 'input' };
    let body;
    if (query.includes('agentgateway_gen_ai_client_cost_usd_total')) {
      body = vector(perAgent(SPEND, priced, only));
    } else if (query.includes('agentgateway_gen_ai_client_token_usage_sum')) {
      body = vector(perAgent(TOKENS, priced, only));
    } else if (
      query.includes('agentgateway_gen_ai_server_request_duration_count')
    ) {
      body = vector(perAgent(CALLS, { gen_ai_response_model: MODEL }, only));
    } else {
      await route.fallback();
      return;
    }
    await route.fulfill({ json: body });
  });
}

/** The table row that carries `text` in its organization cell. */
function rowWith(page: Page, text: string) {
  return page
    .getByRole('rowheader')
    .filter({ hasText: text })
    .locator('xpath=ancestor::*[@role="row"]');
}

function organizationSelect(page: Page) {
  return page.getByRole('main').getByRole('button', { name: /Organization/ });
}

/** Opens the Cost page with the stub, or skips where the lab has no metrics. */
async function openCost(page: Page): Promise<void> {
  await open(page, '/usage/cost');
  const byOrganization = page.getByText('By organization', { exact: true });
  const noObservability = page.getByText(/has no observability stack/);
  await expect(
    byOrganization.or(noObservability).first(),
    'the Cost page renders the by-organization table or says there is nothing to query',
  ).toBeVisible();
  test.skip(
    await noObservability.isVisible(),
    'the lab has no observability stack (platform.observability: false)',
  );
}

test.describe('Usage → Cost, by organization', () => {
  test('rolls the spend up by organization, the platform under None, unattributed traffic apart', async ({
    admin,
  }) => {
    await answerGatewayVectors(admin);
    try {
      await openCost(admin);

      await expect(
        admin.getByText(/Shows the spend of every organization/),
        'the caption says whose spend the page shows',
      ).toBeVisible();
      await expect(
        admin.getByText(/for everyone who can read this environment's metrics/),
        'and for whom',
      ).toBeVisible();

      const alpha = rowWith(admin, 'alpha');
      await expect(alpha.getByText('$6.00'), 'both alpha agents').toBeVisible();
      await expect(alpha.getByText('org-alpha'), 'its namespace').toBeVisible();
      await expect(rowWith(admin, 'beta').getByText('$3.00')).toBeVisible();
      await expect(rowWith(admin, 'None').getByText('$1.00')).toBeVisible();
      await expect(
        rowWith(admin, 'Unattributed').getByText('$0.50'),
      ).toBeVisible();
      await expect(
        rowWith(admin, 'Unattributed').getByRole('link'),
        'unattributed traffic is no scope',
      ).toHaveCount(0);
    } finally {
      await admin.unroute('**/api/gs/mimir/query?*');
    }
  });

  test('narrows every figure to one organization from the scope bar, in the URL, and offers the way back', async ({
    admin,
  }) => {
    await answerGatewayVectors(admin);
    try {
      await openCost(admin);

      await expect(organizationSelect(admin)).toHaveText(/All organizations/);
      await organizationSelect(admin).click();
      await admin
        .getByRole('listbox')
        .getByRole('option', { name: 'beta' })
        .click();

      await expect(admin).toHaveURL(/\/usage\/cost\?organization=org-beta$/);
      await expect(organizationSelect(admin)).toHaveText(/beta/);
      await expect(
        admin.getByText(/Shows the spend of the beta organization/),
      ).toBeVisible();
      // One organization is one row, so the roll-up gives way.
      await expect(
        admin.getByText('By organization', { exact: true }),
      ).toHaveCount(0);
      // The by-agent table holds beta's agent only (by its technical name:
      // the lab has no such agent).
      const byAgent = admin.getByText('By agent', { exact: true });
      await expect(byAgent).toBeVisible();
      await expect(admin.getByText('org-beta/beta-bot')).toBeVisible();
      await expect(admin.getByText('org-alpha/alpha-planner')).toHaveCount(0);

      await admin.getByRole('link', { name: 'Show all organizations' }).click();
      await expect(admin).toHaveURL(/\/usage\/cost$/);
      await expect(
        admin.getByText('By organization', { exact: true }),
      ).toBeVisible();
    } finally {
      await admin.unroute('**/api/gs/mimir/query?*');
    }
  });

  test('a row of the table opens the view narrowed to that organization, and the scope survives a tab switch', async ({
    admin,
  }) => {
    await answerGatewayVectors(admin);
    try {
      await openCost(admin);

      await rowWith(admin, 'alpha')
        .getByRole('link', { name: 'alpha' })
        .click();
      await expect(admin).toHaveURL(/\/usage\/cost\?organization=org-alpha$/);
      await expect(
        admin.getByText(/Shows the spend of the alpha organization/),
      ).toBeVisible();

      // The scope is the whole screen's: Overview keeps it and says so.
      await admin
        .getByRole('main')
        .getByRole('tablist')
        .first()
        .getByRole('tab', { name: 'Overview' })
        .click();
      await expect(admin).toHaveURL(/\/usage\?organization=org-alpha$/);
      await expect(
        admin.getByText(/Shows the model use of the alpha organization/),
      ).toBeVisible();
    } finally {
      await admin.unroute('**/api/gs/mimir/query?*');
    }
  });
});
