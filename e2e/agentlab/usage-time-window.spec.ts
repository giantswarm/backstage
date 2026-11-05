import type { Page } from '@playwright/test';
import { expect, open, test } from './fixtures';

/**
 * The Usage screen's time range: a select labelled "Time range" offering
 * "Last 7 days", "Last 30 days" and "Last 90 days", whose choice travels in
 * the URL (`?window=7d`, the default 30 days left out) and across the
 * screen's tabs. On Your sessions, the windows wider than kagent's own are
 * disabled options that say why.
 */

function timeRange(page: Page) {
  return page.getByRole('main').getByRole('button', { name: /Time range/ });
}

function windowOption(page: Page, days: number) {
  return page
    .getByRole('listbox')
    .getByRole('option', { name: `Last ${days} days` });
}

async function chooseWindow(page: Page, days: number) {
  await timeRange(page).click();
  await windowOption(page, days).click();
}

function usageTab(page: Page, name: string) {
  return page
    .getByRole('main')
    .getByRole('tablist')
    .first()
    .getByRole('tab', { name });
}

test.describe('Usage → time range', () => {
  test('picks a window, keeps it in the URL and across tabs, and drops the default', async ({
    admin,
  }) => {
    await open(admin, '/usage');

    await expect(timeRange(admin), 'the default window').toHaveText(
      /Last 30 days/,
    );

    await chooseWindow(admin, 7);
    await expect(admin).toHaveURL(/\/usage\?window=7d$/);
    await expect(timeRange(admin)).toHaveText(/Last 7 days/);

    // The scope is the whole screen's: another tab keeps it.
    await usageTab(admin, 'Cost').click();
    await expect(admin).toHaveURL(/\/usage\/cost\?window=7d$/);
    await expect(timeRange(admin)).toHaveText(/Last 7 days/);

    await chooseWindow(admin, 30);
    await expect(admin).toHaveURL(/\/usage\/cost$/);
  });

  test('the time range box lines up with the Environment select, or stands alone at its height', async ({
    admin,
  }) => {
    await open(admin, '/usage');
    const trigger = timeRange(admin);
    await expect(trigger).toBeVisible();
    const box = (await trigger.boundingBox())!;
    expect(Math.round(box.height), 'a small select').toBe(32);

    // The Environment select shows only where the portal knows more than one
    // installation; where it does, both boxes share their height and bottom
    // edge.
    const environment = admin
      .getByRole('main')
      .getByRole('button', { name: /Environment/ });
    if (await environment.isVisible()) {
      const selectBox = (await environment.boundingBox())!;
      expect(Math.round(selectBox.height)).toBe(Math.round(box.height));
      expect(Math.round(box.y + box.height)).toBe(
        Math.round(selectBox.y + selectBox.height),
      );
    }
  });

  test('on Your sessions, windows wider than kagent keeps are disabled with the reason', async ({
    admin,
  }) => {
    const usage = admin.waitForResponse(response =>
      response.url().includes('/api/agent-platform/kagent/session-usage'),
    );
    await open(admin, '/usage/your-sessions');
    const response = await usage;
    const body = response.ok()
      ? ((await response.json()) as { windowDays?: number })
      : {};
    const windowDays = body.windowDays ?? 0;
    test.skip(
      windowDays <= 0,
      `the lab's kagent answered no session usage window (HTTP ${response.status()})`,
    );
    test.skip(
      windowDays >= 90,
      `the lab keeps ${windowDays} days of session usage, so no window is disabled`,
    );

    await timeRange(admin).click();
    const ninety = windowOption(admin, 90);
    await expect(ninety).toHaveAttribute('aria-disabled', 'true');
    await expect(ninety).toContainText(
      `kagent keeps ${windowDays} days of session usage`,
    );
    await expect(windowOption(admin, 7)).not.toHaveAttribute('aria-disabled');
    await admin.keyboard.press('Escape');

    // The gateway views query any window, so nothing is disabled there.
    await usageTab(admin, 'Overview').click();
    await timeRange(admin).click();
    await expect(windowOption(admin, 90)).not.toHaveAttribute('aria-disabled');
    await admin.keyboard.press('Escape');
  });
});
