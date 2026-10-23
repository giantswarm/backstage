import type { Page } from '@playwright/test';
import { expect, open, test } from './fixtures';

/**
 * The Usage screen's time range: "Last [7 | 30 | 90] days" under a "Time
 * range" label, a radio group whose choice travels in the URL (`?window=7d`,
 * the default 30 days left out) and across the screen's tabs. On Your
 * sessions, the windows wider than kagent's own are disabled, saying why.
 */

function timeRange(page: Page) {
  return page.getByRole('radiogroup', { name: 'Time range' });
}

function windowOption(page: Page, days: number) {
  return timeRange(page).getByRole('radio', { name: `Last ${days} days` });
}

test.describe('Usage → time range', () => {
  test('picks a window, keeps it in the URL and across tabs, and drops the default', async ({
    admin,
  }) => {
    await open(admin, '/usage');

    await expect(timeRange(admin)).toBeVisible();
    await expect(windowOption(admin, 30), 'the default window').toBeChecked();
    // "Last" and "days" are said once; each option shows only its number.
    await expect(windowOption(admin, 7)).toHaveText('7');

    await windowOption(admin, 7).click();
    await expect(admin).toHaveURL(/\/usage\?window=7d$/);
    await expect(windowOption(admin, 7)).toBeChecked();
    await expect(windowOption(admin, 30)).not.toBeChecked();

    // The scope is the whole screen's: another tab keeps it.
    await admin
      .getByRole('main')
      .getByRole('tablist')
      .first()
      .getByRole('tab', { name: 'Cost' })
      .click();
    await expect(admin).toHaveURL(/\/usage\/cost\?window=7d$/);
    await expect(windowOption(admin, 7)).toBeChecked();

    await windowOption(admin, 30).click();
    await expect(admin).toHaveURL(/\/usage\/cost$/);
  });

  test('the time range box lines up with the Environment select, or stands alone at its height', async ({
    admin,
  }) => {
    await open(admin, '/usage');
    const group = timeRange(admin);
    await expect(group).toBeVisible();
    const box = (await group.boundingBox())!;
    expect(Math.round(box.height), 'as tall as a small select').toBe(32);

    // The Environment select shows only where the portal knows more than one
    // installation; where it does, both boxes share a bottom edge.
    const environment = admin
      .getByRole('main')
      .getByRole('button', { name: /Environment/ });
    if (await environment.isVisible()) {
      const selectBox = (await environment.boundingBox())!;
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

    const reason = `kagent keeps ${windowDays} days of session usage`;
    await expect(windowOption(admin, 90)).toBeDisabled();
    await expect(windowOption(admin, 90)).toHaveAttribute('title', reason);
    await expect(windowOption(admin, 7)).toBeEnabled();

    // The gateway views query any window, so nothing is disabled there.
    await admin
      .getByRole('main')
      .getByRole('tablist')
      .first()
      .getByRole('tab', { name: 'Overview' })
      .click();
    await expect(windowOption(admin, 90)).toBeEnabled();
  });
});
