import type { Page } from '@playwright/test';
import { expect, open } from './fixtures';
import { lab } from './lab';

/**
 * Opens the page of the lab's `default-model-config` with the signed-in
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
  await page
    .getByRole('rowheader', { name: /^default-model-config/ })
    .getByRole('link')
    .click();
  const detail = new RegExp(
    `/customize/models/${lab.installation}/[^/]+/default-model-config$`,
  );
  await expect(page).toHaveURL(detail);
  return new URL(page.url()).pathname;
}
