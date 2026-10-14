import type { Page } from '@playwright/test';
import {
  expect,
  expectClearOfBottomBar,
  expectNoHorizontalScroll,
  open,
  openReadyAgent,
  test,
} from './fixtures';

/**
 * Sessions on a phone (wave 2A): a session started from the home screen with
 * a two-line message — on touch, Return breaks the line and only Start/Send
 * sends (T22 B2) — the composer above the bottom bar on both screens, and the
 * Sessions list as stacked rows whose titles read in full, not the desktop
 * table squeezed to a 31px title column (B1). The session is the worker's
 * own agent's and is deleted again through the portal.
 */

async function deleteCurrentSession(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Session actions' }).click();
  await page.getByRole('menuitem', { name: /Delete session/ }).click();
  const dialog = page.getByRole('dialog', { name: /Delete session/ });
  await expect(dialog).toBeVisible();
  // Right after a turn kagent refuses the delete until the runtime's cleanup
  // settles ("not yet settled: precondition failed", shown in the dialog);
  // a person tries again a little later, and so does this.
  await expect
    .poll(
      async () => {
        if (!(await dialog.isVisible())) {
          return 'deleted';
        }
        await dialog
          .getByRole('button', { name: 'Delete session' })
          .click({ timeout: 5_000 })
          .catch(() => undefined);
        return 'refused';
      },
      { timeout: 120_000, intervals: [10_000] },
    )
    .toBe('deleted');
  await expect(page).toHaveURL(/\/agent-platform\/sessions$/, {
    timeout: 60_000,
  });
}

test('a session starts from the home screen with a two-line message, its composer clear of the bar', async ({
  admin,
  labAgent,
}) => {
  test.setTimeout(10 * 60_000);
  await openReadyAgent(admin, labAgent);

  await open(admin, '/');
  const prompt = admin.getByRole('textbox', { name: 'Prompt' });
  await expect(prompt).toBeVisible();
  await expectNoHorizontalScroll(admin, 'the home screen');

  // The composer's agent picker (labelled "Select agent", T89): its trigger
  // reads the placeholder or the agent chosen, then its name, Agent.
  await admin
    .getByRole('button', { name: /(^| )Agent$/ })
    .first()
    .click();
  await admin
    .getByRole('option', { name: new RegExp(labAgent.name) })
    .first()
    .click();

  // Return on a soft keyboard is a newline, never a send.
  await prompt.click();
  await admin.keyboard.type('Answer with the word ready.');
  await admin.keyboard.press('Enter');
  await admin.keyboard.type('Nothing else.');
  await expect(prompt).toHaveValue(
    'Answer with the word ready.\nNothing else.',
  );
  await expect(admin, 'Return did not send').toHaveURL(/\/$/);

  const start = admin.getByRole('button', { name: 'Start', exact: true });
  await expectClearOfBottomBar(admin, start, 'Start');
  await start.click();
  await expect(admin).toHaveURL(/\/agent-platform\/sessions\/[^/]+\/[^/]+$/, {
    timeout: 60_000,
  });

  try {
    // The first message, both lines of it.
    await expect(admin.getByText('Nothing else.').first()).toBeVisible({
      timeout: 60_000,
    });
    const message = admin.getByRole('textbox', { name: /Message|Prompt/ });
    await expect(message).toBeVisible();
    await expectClearOfBottomBar(admin, message, 'the session composer');
    await expectNoHorizontalScroll(admin, 'the session page');
  } finally {
    await deleteCurrentSession(admin);
  }
});

test('Sessions lists stacked rows whose titles read in full', async ({
  admin,
}) => {
  await open(admin, '/agent-platform/sessions');
  await expect(
    admin.getByRole('heading', { level: 1, name: 'Sessions' }),
  ).toBeVisible();
  await expectNoHorizontalScroll(admin, 'Sessions');
  // No desktop table at phone width.
  await expect(admin.getByRole('main').getByRole('table')).toHaveCount(0);
  // One stacked list per day; a row is a list item linking to its session.
  const rows = admin
    .getByRole('main')
    .getByRole('listitem')
    .filter({ has: admin.locator('a[href*="/agent-platform/sessions/"]') });
  await rows
    .first()
    .waitFor({ timeout: 60_000 })
    .catch(() => undefined);
  test.skip(
    (await rows.count()) === 0,
    'the admin has no session on this lab to list',
  );
  const title = rows
    .first()
    .locator('a[href*="/agent-platform/sessions/"]')
    .first();
  const box = await title.boundingBox();
  expect(
    box!.width,
    'the title takes the row, not a 31px column',
  ).toBeGreaterThan(150);
});
