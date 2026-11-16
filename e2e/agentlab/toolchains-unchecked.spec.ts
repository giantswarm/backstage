import type { Route } from '@playwright/test';

import { expect, open, test } from './fixtures';
import { lab } from './lab';

/**
 * Toolchains where no environment's Muster could say whether it runs the
 * toolchain-manager: the Toolchains tab and the New toolchain page say so,
 * with why, and offer a Retry, instead of reading forever.
 *
 * **muster-backend's answer is stubbed at the browser**: the server list
 * (`/api/muster/servers`) fails with a 500, as when the lab's muster does not
 * answer. Taking the lab's muster down would break every other spec running
 * against it. Once the stub is lifted, Retry reads the lab's muster again and
 * the page leaves the state.
 */

const isServerList = (url: URL) => url.pathname.endsWith('/api/muster/servers');

function notAnswering(route: Route): Promise<void> {
  if (route.request().method() !== 'GET') {
    return route.fallback();
  }
  return route.fulfill({
    status: 500,
    contentType: 'application/json',
    json: {
      error: {
        name: 'Error',
        message: `muster on ${lab.installation} did not answer`,
      },
    },
  });
}

for (const [page, path] of [
  ['the Toolchains tab', '/customize/toolchains'],
  ['the New toolchain page', '/customize/toolchains/new'],
] as const) {
  test(`${page} says why it could not check for toolchains, and retries`, async ({
    admin,
  }) => {
    await admin.route(isServerList, notAnswering);
    await open(admin, path);

    const card = admin
      .getByRole('main')
      .getByRole('heading', { name: 'Toolchains could not be checked' });
    await expect(card).toBeVisible({ timeout: 60_000 });
    await expect(admin.getByRole('main')).toContainText(
      `Muster on ${lab.installation} did not answer.`,
    );
    // The state replaces the endless loading indicator.
    await expect(
      admin.getByText(/Reading the (toolchains|environments)…/),
    ).toHaveCount(0);

    // The lab's muster answers again: Retry reads it, and the state goes.
    await admin.unroute(isServerList, notAnswering);
    await admin.getByRole('button', { name: 'Retry' }).click();
    await expect(card).toBeHidden({ timeout: 60_000 });
  });
}
