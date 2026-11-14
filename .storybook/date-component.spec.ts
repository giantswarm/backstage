import { expect, test } from '@playwright/test';

const STORY = '/iframe.html?id=components-datecomponent--local&viewMode=story';

test('uses the browser clock and reveals the exact time with the keyboard', async ({
  page,
}) => {
  await page.goto(STORY);
  await expect(page.locator('time')).toHaveText('Oct 25, 2026, 02:30 AM');
  await expect(page.locator('time')).toHaveAttribute(
    'datetime',
    '2026-10-25T01:30:12.000Z',
  );
  const trigger = page.getByRole('button', { name: 'Exact date and time' });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toContainText(
    'Oct 25, 2026, 02:30:12 AM GMT+1',
  );
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test.describe('phone touch', () => {
  test.use({ hasTouch: true, viewport: { width: 375, height: 300 } });
  test('opens exact timestamps on a tap without horizontal overflow', async ({
    page,
  }) => {
    await page.goto(STORY);
    await page.getByRole('button', { name: 'Exact date and time' }).tap();
    await expect(page.getByRole('dialog')).toContainText('02:30:12 AM GMT+1');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
});
