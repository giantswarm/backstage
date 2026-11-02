import type { Page } from '@playwright/test';

/**
 * The callers that asked for the open Login Required dialog, as the portal
 * names them on `<body data-login-requested-by>` while they wait on the main
 * sign-in: `portal-fetch` (the portal's own requests) and
 * `cluster-token-mint` (a broker-backed installation's token).
 */
export async function loginRequestedBy(page: Page): Promise<string[]> {
  const callers = await page
    .locator('body')
    .getAttribute('data-login-requested-by');
  return callers ? callers.split(' ') : [];
}
