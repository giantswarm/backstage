import type { Locator, Page, Route } from '@playwright/test';

import { expect, open, test } from './fixtures';

/**
 * A person's connection to their own ChatGPT subscription, the provider App
 * `chatgpt` muster keeps (`muster.providerApps`, flow `chatgptDeviceCode`):
 * the Connections section of Profile and settings, its row's states, and
 * *Connect* answered by the lab's muster with a real OpenAI device code.
 *
 * The code is real: muster asks OpenAI for it. Entering it is a real ChatGPT
 * sign-in, which no headless run makes, so the connected state is staged at
 * the browser in muster's own `auth://status` shape, and *Disconnect* then
 * goes to the lab's muster for real. A lab whose muster keeps no `chatgpt`
 * App skips.
 */

const ROW_TIMEOUT = 60_000;

/** The ChatGPT row of the Connections section, once muster lists the App. */
async function chatGptRow(page: Page): Promise<Locator> {
  await open(page, '/profile');
  const section = page.getByRole('region', { name: 'Connections' });
  await expect(
    section.or(page.getByRole('region', { name: 'Session' })).first(),
  ).toBeVisible();
  // The section appears once muster's status is read; give it that read.
  await section
    .waitFor({ state: 'visible', timeout: 20_000 })
    .catch(() => undefined);
  test.skip(
    !(await section.isVisible()),
    "the lab's muster keeps no provider App (muster.providerApps)",
  );
  const row = section
    .getByRole('listitem')
    .filter({ hasText: /^ChatGPT/ })
    .first();
  test.skip(
    (await row.count()) === 0,
    "the lab's muster keeps no chatgpt App (flow chatgptDeviceCode)",
  );
  return row;
}

const AUTH_STATUS = '**/api/muster/auth/status**';

/**
 * Answers `auth://status` with the person's `chatgpt` App connected until the
 * returned function ends the staging; reads after that pass through. The
 * route stays until `unroute`, after the test: a read in flight while it is
 * removed would be handled twice.
 */
async function stageConnected(page: Page) {
  let staged = true;
  const handler = async (route: Route) => {
    if (!staged) {
      await route.fallback();
      return;
    }
    const answer = await (await route.fetch()).json();
    const apps: Array<{ name: string; status: string }> =
      answer?.providerApps ?? [];
    await route.fulfill({
      json: {
        ...answer,
        providerApps: [
          ...apps.filter(app => app.name !== 'chatgpt'),
          { name: 'chatgpt', status: 'connected' },
        ],
      },
    });
  };
  await page.route(AUTH_STATUS, handler);
  return {
    stop: () => {
      staged = false;
    },
    unroute: () => page.unroute(AUTH_STATUS, handler),
  };
}

test('Connect shows OpenAI’s code with its link, and Cancel ends it', async ({
  admin,
}) => {
  const row = await chatGptRow(admin);
  // A connection left by an earlier run, or a code still outstanding.
  const disconnect = row.getByRole('button', { name: /^(Disconnect|Cancel)$/ });
  if (await disconnect.isVisible()) {
    await disconnect.click();
  }
  await expect(row.getByText(/^Not connected/)).toBeVisible({
    timeout: ROW_TIMEOUT,
  });
  // The provider's page opens in a tab of its own; this run reads the code
  // and closes that one tab (the admin's context outlives this file).
  const providerTab = admin.context().waitForEvent('page');

  await row.getByRole('button', { name: /^(Connect|Try again)$/ }).click();
  await (await providerTab).close();

  await expect(row.getByText('Waiting for your code')).toBeVisible({
    timeout: ROW_TIMEOUT,
  });
  await expect(row.getByTestId('provider-app-user-code')).toHaveText(
    /^[A-Z0-9]{4,}-[A-Z0-9]{4,}$/,
  );
  await expect(
    row.getByRole('link', { name: 'https://auth.openai.com/codex/device' }),
  ).toBeVisible();
  await expect(
    row.getByRole('button', { name: /^Copy the code/ }),
  ).toBeVisible();

  await row.getByRole('button', { name: 'Cancel' }).click();

  await expect(row.getByText(/^Not connected$/)).toBeVisible({
    timeout: ROW_TIMEOUT,
  });
});

test('a connected person sees Connected, and Not connected after Disconnect', async ({
  admin,
}) => {
  // Skips on a lab whose muster keeps no chatgpt App, before the staging
  // below would list one.
  await chatGptRow(admin);
  const staging = await stageConnected(admin);
  try {
    const row = await chatGptRow(admin);
    await expect(row.getByText('✓ Connected')).toBeVisible({
      timeout: ROW_TIMEOUT,
    });

    staging.stop();
    await row.getByRole('button', { name: 'Disconnect' }).click();

    await expect(row.getByText(/^Not connected$/)).toBeVisible({
      timeout: ROW_TIMEOUT,
    });
    await expect(row.getByRole('button', { name: 'Connect' })).toBeEnabled();
  } finally {
    staging.stop();
    await staging.unroute();
  }
});
