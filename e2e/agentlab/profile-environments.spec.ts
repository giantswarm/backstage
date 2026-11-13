import type { Page } from '@playwright/test';

import { expect, open, reloadAccepting, test } from './fixtures';

/**
 * The Environments section of Profile and settings: every configured
 * installation as a toggle chip, switched off app-wide through the same
 * `localStorage` set (`gs-muted-installations`) the classic sidebar's Cluster
 * access widget writes, with All on, All off and Undo.
 */

const MUTED_KEY = 'gs-muted-installations';

async function mutedSet(page: Page): Promise<string[]> {
  return page.evaluate(
    key => JSON.parse(window.localStorage.getItem(key) ?? '[]'),
    MUTED_KEY,
  );
}

test.afterEach(async ({ page }) => {
  // Leave the lab browser with every environment on.
  await page
    .evaluate(key => window.localStorage.removeItem(key), MUTED_KEY)
    .catch(() => undefined);
});

test('switches environments off and on from Profile and settings', async ({
  page,
}) => {
  await open(page, '/profile');
  const section = page.getByRole('region', { name: 'Environments' });
  await expect(section).toBeVisible({ timeout: 30_000 });
  await expect(
    section.getByText(
      'The environments this portal talks to. Turn one off and the portal shows nothing from it.',
      { exact: true },
    ),
  ).toBeVisible();

  const chips = section
    .getByRole('list', { name: 'Environments' })
    .getByRole('button');
  const total = await chips.count();
  expect(total).toBeGreaterThan(0);
  await expect(section.getByRole('button', { name: /^Show all/ })).toHaveCount(
    0,
  );
  const summary = section.getByTestId('environments-summary');
  await expect(summary).toContainText(`${total} of ${total} on`);

  // One chip off: stored in the shared set, and it survives a reload.
  const first = chips.first();
  const name = (await first.textContent())?.trim() ?? '';
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await first.click();
  await expect(first).toHaveAttribute('aria-pressed', 'false');
  await expect(first).toHaveAccessibleName(`${name}, off`);
  await expect(summary).toContainText(`${total - 1} of ${total} on`);
  expect(await mutedSet(page)).toEqual([name]);

  await reloadAccepting(page);
  await expect(chips.first()).toHaveAttribute('aria-pressed', 'false', {
    timeout: 30_000,
  });

  // All off, Undo back to the one off, then All on.
  await section.getByRole('button', { name: 'All off', exact: true }).click();
  await expect(summary).toContainText(`0 of ${total} on`);
  await expect(
    section.getByText(/All environments are off, so the portal shows nothing/),
  ).toBeVisible();
  await section.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await mutedSet(page)).toEqual([name]);

  await section.getByRole('button', { name: 'All on', exact: true }).click();
  await expect(summary).toContainText(`${total} of ${total} on`);
  expect(await mutedSet(page)).toEqual([]);
});
