import type { ConsoleMessage } from '@playwright/test';
import { expect, open, test } from './fixtures';

/**
 * The app starts without a warning that its `app.extensions` names an
 * extension no plugin installs, or configures one with a key its schema does
 * not declare. The new frontend system reports both as
 * `INVALID_EXTENSION_CONFIG_KEY` on the browser console when the app finalizes
 * after sign-in: a warning today, a start-up failure once the check becomes
 * strict. `packages/app/src/appExtensions.test.ts` checks the repository's
 * app-config.yaml; this checks the config the lab's Backstage actually serves
 * (the chart's values on top of it).
 */
test('the app starts without an INVALID_EXTENSION_CONFIG_KEY warning', async ({
  admin,
}) => {
  const warnings: string[] = [];
  const record = (message: ConsoleMessage) => {
    if (message.text().startsWith('INVALID_EXTENSION_CONFIG_KEY')) {
      warnings.push(message.text());
    }
  };
  admin.on('console', record);
  try {
    // A full load: the app finalizes, and reports, once per load.
    await open(admin, '/settings');
  } finally {
    admin.off('console', record);
  }

  expect(warnings, 'app.extensions names only what the app installs').toEqual(
    [],
  );
});
