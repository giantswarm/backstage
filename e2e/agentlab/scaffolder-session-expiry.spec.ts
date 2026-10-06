import type { BrowserContext, Page, Route } from '@playwright/test';

import { completeDexLogin, expect, signIn, test } from './fixtures';
import { contextOptions, lab } from './lab';

/**
 * A template submitted after the sign-in has expired (giantswarm/roadmap#3780).
 *
 * The lab's catalog has no template with a `GSOIDCToken` field, so one is
 * staged at the browser: its parameter schema (a name and the installation's
 * cluster token) and the task creation, whose request body is what these tests
 * read. Everything the token comes from is the lab's own: the Dex session, the
 * portal's refresh route and, for a broker-covered installation, the cluster
 * token broker.
 *
 * The page's clock is jumped two hours after the form is filled, past the
 * lifetime of every token the browser holds, so the cluster token Create
 * sends has to be minted at Create.
 */
const TEMPLATE = 'session-expiry-e2e';
const SECRETS_KEY = 'USER_OIDC_TOKEN';

const PARAMETER_SCHEMA = {
  title: 'Session expiry',
  steps: [
    {
      title: 'Details',
      schema: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', title: 'Name' },
          clusterToken: {
            type: 'object',
            'ui:field': 'GSOIDCToken',
            'ui:options': {
              secretsKey: SECRETS_KEY,
              installationName: lab.installation,
            },
          },
        },
      },
    },
  ],
};

type TaskRequest = {
  values: Record<string, unknown>;
  secrets?: Record<string, string>;
};

async function stageTemplate(page: Page): Promise<TaskRequest[]> {
  const submitted: TaskRequest[] = [];
  await page.route(
    `**/api/scaffolder/v2/templates/default/template/${TEMPLATE}/parameter-schema`,
    route => route.fulfill({ json: PARAMETER_SCHEMA }),
  );
  await page.route('**/api/scaffolder/v2/tasks', async (route: Route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    submitted.push(route.request().postDataJSON() as TaskRequest);
    await route.fulfill({ status: 201, json: { id: 'session-expiry-task' } });
  });
  return submitted;
}

/**
 * Signs a context of its own in with the page's clock under the test's control
 * and fills the staged template up to its review step. Returns the page and
 * the task requests it sends.
 */
async function fillTemplate(context: BrowserContext) {
  const page = await context.newPage();
  await page.clock.install();
  await signIn(page, lab.users.admin);
  const submitted = await stageTemplate(page);

  await page.goto(`/create/templates/default/${TEMPLATE}`);
  await page.getByRole('textbox', { name: 'Name' }).fill('expiry-check');
  await page.getByRole('button', { name: 'Review' }).click();
  await expect(page.getByRole('button', { name: 'Create' })).toBeVisible();

  return { page, submitted };
}

function tokenClaims(token: string | undefined): { iat?: number } {
  const payload = token?.split('.')[1];
  return payload
    ? JSON.parse(Buffer.from(payload, 'base64url').toString())
    : {};
}

/** Whole seconds, Dex's resolution for `iat`, with the next one begun. */
async function nextSecond(): Promise<number> {
  const second = Math.floor(Date.now() / 1000) + 1;
  await new Promise(resolve => setTimeout(resolve, second * 1000 - Date.now()));
  return second;
}

test.describe('a template submitted after the sign-in expired', () => {
  let context: BrowserContext;

  test.beforeEach(async ({ browser }) => {
    context = await browser.newContext(contextOptions);
  });

  test.afterEach(async () => {
    await context.close();
  });

  test('sends a cluster token minted at Create', async () => {
    const { page, submitted } = await fillTemplate(context);

    const createdAt = await nextSecond();
    await page.clock.fastForward('02:00:00');
    const minted = page.waitForRequest(request =>
      /\/api\/auth\/(cluster-token\/|[^/]+\/refresh)/.test(request.url()),
    );
    await page.getByRole('button', { name: 'Create' }).click();
    await minted;

    await expect(page).toHaveURL(/\/create\/tasks\/session-expiry-task/);
    expect(submitted).toHaveLength(1);
    const [task] = submitted;
    expect(task.values.name).toBe('expiry-check');
    expect(
      task.values.clusterToken,
      'the field names the installation the token is for',
    ).toEqual({ oidcTokenInstallation: lab.installation });
    const token = task.secrets?.[SECRETS_KEY];
    expect(token, 'the task carries the cluster token').toBeTruthy();
    expect(
      tokenClaims(token).iat,
      'the token sent was issued after Create was selected',
    ).toBeGreaterThanOrEqual(createdAt);
  });

  test('declining the login keeps the entries, and Create signs in and submits them', async () => {
    const { page, submitted } = await fillTemplate(context);

    await page.route('**/api/auth/*/refresh**', route =>
      route.fulfill({
        status: 401,
        json: { error: { name: 'AuthenticationError' } },
      }),
    );
    await page.clock.fastForward('02:00:00');
    await page.getByRole('button', { name: 'Create' }).click();

    const login = page.getByRole('dialog', { name: 'Login Required' });
    await expect(login, 'the portal asks for the sign-in').toBeVisible();
    await login.getByRole('button', { name: 'Reject All' }).click();

    const alert = page.getByRole('alert').filter({
      hasText: 'Your sign-in expired',
    });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('your entries are kept');
    await expect(alert).toBeFocused();
    expect(submitted, 'nothing was submitted').toHaveLength(0);
    await expect(page.getByRole('progressbar')).toBeHidden();

    await page.unroute('**/api/auth/*/refresh**');
    await page.getByRole('button', { name: 'Create' }).click();

    const done = page.waitForURL(/\/create\/tasks\/session-expiry-task/);
    const prompted = await login
      .waitFor({ state: 'visible', timeout: 5_000 })
      .then(
        () => true,
        () => false,
      );
    if (prompted) {
      const popup = page.waitForEvent('popup');
      await login.getByRole('button', { name: 'Log in' }).first().click();
      await completeDexLogin(await popup, lab.users.admin);
    }
    await done;
    expect(submitted).toHaveLength(1);
    expect(submitted[0].values.name, 'the same entries are submitted').toBe(
      'expiry-check',
    );
    expect(submitted[0].secrets?.[SECRETS_KEY]).toBeTruthy();
  });
});
