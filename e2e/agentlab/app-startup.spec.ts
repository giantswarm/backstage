import { expect, gotoApp, portalChrome, signIn, test } from './fixtures';
import { lab } from './lab';

type StartupWindow = Window & { __appStartupWarnings?: string[] };

/**
 * The app the lab's Backstage serves starts cleanly with the config it
 * actually serves (the chart's values on top of the repository's
 * app-config.yaml):
 *
 * - no `INVALID_EXTENSION_CONFIG_KEY` warning, which `createApp` prints on the
 *   console when `app.extensions` names an extension the app does not install
 *   (a start-up failure once the frontend system makes the check strict);
 * - no "App startup failed" page, which `createApp` shows instead of the app
 *   for the start-up errors, among them an extension `config` its schema
 *   rejects (`EXTENSION_CONFIGURATION_INVALID`).
 *
 * `packages/app/src/appExtensions.test.ts` checks the repository's
 * app-config.yaml for both.
 */
test('the app starts without an INVALID_EXTENSION_CONFIG_KEY warning or a start-up failure', async ({
  signInAs,
}) => {
  const user = lab.users.admin;
  const page = await signInAs(user);

  // `createApp` prints its warnings while it renders the finalized app, in the
  // same render that mounts the portal's chrome. Recorded in the page rather
  // than from Playwright's `console` events, which arrive asynchronously and
  // could still be on their way when the chrome is found.
  await page.addInitScript(() => {
    const warnings: string[] = [];
    (window as StartupWindow).__appStartupWarnings = warnings;
    // eslint-disable-next-line no-console -- wraps the app's console.warn to record it
    const warn = console.warn.bind(console);
    // eslint-disable-next-line no-console -- wraps the app's console.warn to record it
    console.warn = (...args: unknown[]) => {
      if (
        typeof args[0] === 'string' &&
        args[0].startsWith('INVALID_EXTENSION_CONFIG_KEY')
      ) {
        warnings.push(args[0]);
      }
      warn(...args);
    };
  });

  // A full load: the app finalizes, and reports, once per load.
  await gotoApp(page, '/settings');
  const chrome = portalChrome(page);
  const failed = page.getByRole('heading', { name: 'App startup failed' });
  const card = page.getByRole('button', { name: 'Sign In' });
  await expect(chrome.or(failed).or(card).first()).toBeAttached({
    timeout: 60_000,
  });
  // A Backstage pod roll in the shared lab drops the session: sign in again,
  // which finalizes the app in the same page, the init script still in place.
  if ((await chrome.count()) === 0 && (await failed.count()) === 0) {
    await signIn(page, user);
  }

  if ((await failed.count()) > 0) {
    throw new Error(
      `the app shows "App startup failed": ${await page.locator('body').innerText()}`,
    );
  }
  await expect(chrome).toBeAttached();
  const warnings = await page.evaluate(
    () => (window as StartupWindow).__appStartupWarnings ?? [],
  );
  expect(warnings, 'app.extensions names only what the app installs').toEqual(
    [],
  );
});
