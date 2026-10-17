import type { Page } from '@playwright/test';

/**
 * Reports the tab's user activation (`navigator.userActivation.isActive`) as
 * a browser does for a tab nobody touches, until {@link touch}: Playwright's
 * own calls (the fake clock's, a locator's) count as gestures, so under it a
 * page reads as just clicked all the time. The portal lets only a request a
 * person's gesture starts open the sign-in.
 */
export async function idleTab(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'userActivation', {
      configurable: true,
      get: () => ({
        isActive: Boolean((window as any).__e2eUserGesture),
        hasBeenActive: true,
      }),
    });
  });
}

/** The person acts: the tab's next requests carry a user gesture. */
export async function touch(page: Page) {
  await page.evaluate(() => {
    (window as any).__e2eUserGesture = true;
  });
}
