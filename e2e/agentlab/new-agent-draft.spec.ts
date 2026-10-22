import type { Page } from '@playwright/test';
import {
  expect,
  expectWizardStep,
  open,
  reloadAccepting,
  test,
} from './fixtures';

/**
 * The New agent wizard keeps a draft (giantswarm/giantswarm#38775): what the
 * person entered survives a reload and leaving the form in the same tab, the
 * form says so with a way to start over, and the links inside the form open a
 * new tab. Nothing is created; the test ends on Start over, and the fixtures
 * drop any draft a failed run leaves before the next test.
 */

const NAME = 'E2E Draft Agent';
const DESCRIPTION = 'Kept across a reload; never created.';

const field = (page: Page, name: string) =>
  page.getByRole('textbox', { name, exact: true });

const draftNote = (page: Page) => page.getByText('Your draft is back');

test('the New agent form comes back with its draft, and starts over on request', async ({
  admin,
}) => {
  await open(admin, '/customize/agents/new');
  await expectWizardStep(admin, 'Details');
  await expect(draftNote(admin), 'a fresh form has no draft').toHaveCount(0);
  await field(admin, 'Name').fill(NAME);
  await field(admin, 'What is it for?').fill(DESCRIPTION);

  // A reload: the browser asks first while the form holds input; accepting
  // it reloads, and the form comes back as it was.
  await reloadAccepting(admin);
  await expectWizardStep(admin, 'Details');
  await expect(field(admin, 'Name')).toHaveValue(NAME);
  await expect(field(admin, 'What is it for?')).toHaveValue(DESCRIPTION);
  await expect(draftNote(admin)).toBeVisible();

  // Leaving through the shell's own navigation, then the browser's Back.
  await open(admin, '/sessions');
  await admin.goBack();
  await expectWizardStep(admin, 'Details');
  await expect(field(admin, 'Name')).toHaveValue(NAME);
  await expect(draftNote(admin)).toBeVisible();

  // Start over asks, then empties the form and drops the draft.
  await admin.getByRole('button', { name: 'Start over' }).click();
  const dialog = admin.getByRole('dialog');
  await expect(dialog).toContainText('Start over?');
  await dialog.getByRole('button', { name: 'Discard draft' }).click();
  await expect(field(admin, 'Name')).toHaveValue('');
  await expect(draftNote(admin)).toHaveCount(0);

  await reloadAccepting(admin);
  await expectWizardStep(admin, 'Details');
  await expect(field(admin, 'Name')).toHaveValue('');
  await expect(draftNote(admin)).toHaveCount(0);
});

test('every link inside the New agent form opens in a new tab', async ({
  admin,
}) => {
  await open(admin, '/customize/agents/new');
  await expectWizardStep(admin, 'Details');
  await admin
    .locator('summary')
    .filter({ hasText: /^More options/ })
    .click();

  // The step's own content: the frame's Close, step strip and Cancel stay
  // inside the flow (or ask before leaving it), so they are not counted.
  const leaving = await admin
    .locator('[data-field-validation-scope] a[href]')
    .evaluateAll(links =>
      links
        .filter(
          link =>
            !link.closest('ol[aria-label="Steps"]') &&
            link.getAttribute('aria-label') !== 'Close' &&
            link.textContent?.trim() !== 'Cancel' &&
            link.getAttribute('target') !== '_blank',
        )
        .map(
          link => `${link.textContent?.trim()} → ${link.getAttribute('href')}`,
        ),
    );
  expect(leaving, 'links that would take the form away').toEqual([]);
});
