import type { Page } from '@playwright/test';
import { expect, open, signIn, test } from './fixtures';
import { contextOptionsFor, lab } from './lab';
import {
  dropPersistedQueriesOnNextLoad,
  installPersistedQueryDrop,
  skipWithoutModelManager,
  stubModelManagerTools,
  ToolSignInRequired,
} from './model-manager.fixture';

/**
 * The Serving view for a person who has not signed in to model-manager
 * (giantswarm/giantswarm#39090): muster answers every model-manager call with
 * its 401 `server_sign_in_required`, and each call makes it create another
 * sign-in challenge. The page offers the sign-in in place of the "could not
 * be read" warning, and reads `list_backends` once: not again on its
 * 60-second poll, not from a hidden tab, not on returning to the tab. Only
 * the sign-in reads it again (unit-tested: `ModelManagerSignInAlerts`).
 *
 * **model-manager's answer is stubbed at the browser** (`list_backends`
 * refused with muster-backend's 401); everything else is real. The page's
 * clock is faked so minutes of polling pass in seconds.
 */

/** Send the tab to the background or bring it back, as react-query's focus manager sees it. */
async function setTabVisible(page: Page, visible: boolean): Promise<void> {
  await page.evaluate(shown => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => (shown ? 'visible' : 'hidden'),
    });
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => !shown,
    });
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
  }, visible);
}

// Model hosting is drawn only where model-manager answers.
skipWithoutModelManager();

test('where muster asks for a sign-in to model-manager, the Serving view offers it and reads list_backends once: not on its poll, not from a hidden tab, not on returning to the tab', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const context = await browser.newContext(contextOptionsFor('desktop'));
  try {
    const page = await context.newPage();
    await page.clock.install();
    await signIn(page, lab.users.admin);
    await installPersistedQueryDrop(page);
    const staged = await stubModelManagerTools(page, {
      list_backends: new ToolSignInRequired(),
    });
    await dropPersistedQueriesOnNextLoad(page);
    await open(page, '/customize/models/hosting');

    await expect(
      page.getByText(
        new RegExp(
          `Served models are read through the .+ connector, which acts as you\\. You have not signed in to it on ${lab.installation} yet\\.`,
        ),
      ),
      'the sign-in to model-manager is offered',
    ).toBeVisible({ timeout: 60_000 });
    await expect(
      page.getByText(
        new RegExp(`served models on ${lab.installation} could not be read`),
      ),
      'no read warning that a sign-in fixes',
    ).toHaveCount(0);
    const reads = staged.callsOf('list_backends').length;
    expect(reads, 'the descriptors were asked over muster').toBeGreaterThan(0);

    // Three of the descriptors' 60-second polls.
    await page.clock.runFor('00:03:00');
    expect(
      staged.callsOf('list_backends'),
      'no poll after the sign-in answer',
    ).toHaveLength(reads);

    // Away and back: nothing while hidden, nothing on the return.
    await setTabVisible(page, false);
    await page.clock.runFor('00:02:00');
    await setTabVisible(page, true);
    await page.clock.runFor('00:00:05');
    expect(
      staged.callsOf('list_backends'),
      'no read from the hidden tab or on coming back to it',
    ).toHaveLength(reads);

    await staged.unroute();
  } finally {
    await context.close();
  }
});
