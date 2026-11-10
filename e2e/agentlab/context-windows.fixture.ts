import type { Locator, Page } from '@playwright/test';
import { expect, open } from './fixtures';
import { lab } from './lab';

/**
 * The Models table's row of the platform's default model: the lab's default
 * model (`lab.defaultModel`) in `kagent`, by its link, since every
 * organization namespace holds one of the same name.
 */
export function platformDefaultModelRow(page: Page): Locator {
  return page.getByRole('rowheader').filter({
    has: page.locator(
      `a[href$="/${lab.installation}/kagent/${lab.defaultModel}"]`,
    ),
  });
}

/**
 * Opens the page of the lab's default model (`lab.defaultModel`) with the signed-in
 * config's context-window table (`agentPlatform.models.contextWindows`)
 * replaced by `table`, so the page's Context window fact or note does not
 * depend on which model the lab runs. Returns the model's path.
 */
export async function openDefaultModelWithContextWindows(
  page: Page,
  table: Record<string, unknown>,
): Promise<string> {
  await page.route('**/api/gs/config', async route => {
    const response = await route.fetch();
    const config = await response.json();
    config.agentPlatform ??= {};
    config.agentPlatform.models ??= {};
    config.agentPlatform.models.contextWindows = table;
    await route.fulfill({ response, json: config });
  });
  await open(page, '/customize/models');
  await platformDefaultModelRow(page).getByRole('link').click();
  const detail = new RegExp(
    `/customize/models/${lab.installation}/[^/]+/${lab.defaultModel}$`,
  );
  await expect(page).toHaveURL(detail);
  return new URL(page.url()).pathname;
}
