import type { Page } from '@playwright/test';
import { expect, open, test } from './fixtures';

/**
 * The Cost page's calendar month (giantswarm/backstage#2672): the Time range
 * select offers this month so far and the two before it; a past month is
 * reported exactly, evaluated at its end, and the page then also shows spend
 * by person, the gateway's `user` label, beside the agents: the chargeback
 * view, with the Organization scope.
 *
 * The gateway's vectors are answered at the browser, as `usage-cost.spec.ts`
 * answers them: a fresh lab has no spend in a past month. The stub answers
 * every pinned (`@`) query of the month, the by-person ones included, and
 * lets everything else through to the lab's Prometheus.
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

const AGENTS = [
  { agent_namespace: 'org-alpha', agent: 'alpha-planner' },
  { agent_namespace: 'kagent', agent: 'platform-agent' },
];
const PEOPLE = [
  { user: 'alice@lab.local' },
  { user: 'bob@lab.local' },
  { user: 'unknown' },
];

function series(
  rows: Record<string, string>[],
  values: number[],
  labels: Record<string, string>,
): Series[] {
  return rows.map((row, index) => ({
    labels: { ...row, ...labels },
    value: values[index],
  }));
}

/** The month `back` months before the one running now, in UTC, and its label. */
function monthBack(back: number): { key: string; label: string } {
  const now = new Date();
  const first = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1),
  );
  const key = `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, '0')}`;
  const label = first.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return { key, label };
}

/**
 * Answers the month's pinned queries: spend, tokens and calls per agent, the
 * by-person spend and tokens, and the "data before" counts, so the delta
 * against the month before shows. Unpinned queries are the lab's.
 */
async function answerMonthVectors(page: Page): Promise<void> {
  await page.route('**/api/gs/mimir/query?*', async route => {
    const query =
      new URL(route.request().url()).searchParams.get('query') ?? '';
    if (!query.includes(' @ ')) {
      await route.fallback();
      return;
    }
    const priced = { gen_ai_response_model: MODEL, gen_ai_token_type: 'input' };
    let body;
    if (query.startsWith('count(last_over_time(')) {
      body = vector([{ labels: {}, value: 1 }]);
    } else if (query.startsWith('sum by (user)')) {
      body = query.includes('cost_usd_total')
        ? vector(series(PEOPLE, [6, 3, 1], {}))
        : vector(series(PEOPLE, [600_000, 300_000, 100_000], {}));
    } else if (query.includes('agentgateway_gen_ai_client_cost_usd_total')) {
      body = vector(series(AGENTS, [8, 2], priced));
    } else if (query.includes('agentgateway_gen_ai_client_token_usage_sum')) {
      body = vector(series(AGENTS, [800_000, 200_000], priced));
    } else if (
      query.includes('agentgateway_gen_ai_server_request_duration_count')
    ) {
      body = vector(series(AGENTS, [80, 20], { gen_ai_response_model: MODEL }));
    } else {
      await route.fallback();
      return;
    }
    await route.fulfill({ json: body });
  });
}

function timeRange(page: Page) {
  return page.getByRole('main').getByRole('button', { name: /Time range/ });
}

/**
 * The table row whose header cell reads exactly `text`, as `usage-cost.spec.ts`
 * finds its rows: a substring would take the organization "alpha" for its
 * agent "org-alpha/alpha-planner" as well.
 */
function rowWith(page: Page, text: string) {
  return page
    .getByText(text, { exact: true })
    .locator('xpath=ancestor::*[@role="row"]');
}

test.describe('Usage → Cost, a calendar month', () => {
  test('reports a past month by organization, agent and person, and compares it with the month before', async ({
    admin,
  }) => {
    const month = monthBack(1);
    await answerMonthVectors(admin);
    try {
      await open(admin, '/usage/cost');
      const byOrganization = admin.getByText('By organization', {
        exact: true,
      });
      const noObservability = admin.getByText(/has no observability stack/);
      await expect(byOrganization.or(noObservability).first()).toBeVisible();
      test.skip(
        await noObservability.isVisible(),
        'the lab has no observability stack (platform.observability: false)',
      );

      await timeRange(admin).click();
      await admin
        .getByRole('listbox')
        .getByRole('option', { name: month.label })
        .click();

      await expect(admin).toHaveURL(
        new RegExp(`/usage/cost\\?window=${month.key}$`),
      );
      await expect(timeRange(admin)).toHaveText(new RegExp(month.label));
      await expect(
        admin.getByText(
          new RegExp(
            `Shows the spend of every organization on .* in ${month.label}, for everyone`,
          ),
        ),
      ).toBeVisible();

      // The month's spend, and the change against the month before.
      await expect(
        admin.getByText(new RegExp(`vs ${monthBack(2).label}`)),
      ).toBeVisible();
      await expect(rowWith(admin, 'alpha').getByText('$8.00')).toBeVisible();
      await expect(rowWith(admin, 'None').getByText('$2.00')).toBeVisible();

      // By person: the chargeback rows, the unnamed calls as their own.
      await expect(admin.getByText('By person', { exact: true })).toBeVisible();
      await expect(
        rowWith(admin, 'alice@lab.local').getByText('$6.00'),
      ).toBeVisible();
      await expect(
        rowWith(admin, 'bob@lab.local').getByText('$3.00'),
      ).toBeVisible();
      await expect(
        rowWith(admin, 'No person recorded').getByText('$1.00'),
      ).toBeVisible();
    } finally {
      await admin.unroute('**/api/gs/mimir/query?*');
    }
  });

  test('a days window shows no by-person table, and a month is a disabled choice on Your sessions', async ({
    admin,
  }) => {
    const month = monthBack(1);
    await open(admin, '/usage/cost');
    const byAgent = admin.getByText('By agent', { exact: true });
    const noObservability = admin.getByText(/has no observability stack/);
    await expect(byAgent.or(noObservability).first()).toBeVisible();
    test.skip(
      await noObservability.isVisible(),
      'the lab has no observability stack (platform.observability: false)',
    );
    await expect(admin.getByText('By person', { exact: true })).toHaveCount(0);

    await admin
      .getByRole('main')
      .getByRole('tablist')
      .first()
      .getByRole('tab', { name: 'Your sessions' })
      .click();
    await timeRange(admin).click();
    const option = admin
      .getByRole('listbox')
      .getByRole('option', { name: month.label });
    await expect(option).toHaveAttribute('aria-disabled', 'true');
    await expect(option).toContainText(
      'kagent reports session usage over days back from today only',
    );
    await admin.keyboard.press('Escape');
  });
});
