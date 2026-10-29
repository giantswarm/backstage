import type { Page } from '@playwright/test';
import {
  expect,
  expectClearOfBottomBar,
  expectNoHorizontalScroll,
  expectWizardStep,
  fillAgentDetails,
  open,
  reloadAccepting,
  test,
} from './fixtures';

/**
 * The New agent wizard on a phone, Details → Skills → Tools → Review (wave
 * 2C, T81): the stepper as one "Step N of M · <step>" line, Continue above
 * the bottom bar on every step, a connector's Read-only / All choice usable
 * at 375px with the *Selected so far* bar in place of the desktop rail, and
 * agent-manager's dry run on Review. Nothing is created: the worker's
 * `labAgent` is the wizard's full pass to Create.
 */

const NAME = 'E2E Phone Wizard';

async function continueFrom(page: Page, step: string) {
  const next = page.getByRole('button', { name: 'Continue' }).first();
  await expectClearOfBottomBar(page, next, `Continue on ${step}`);
  await next.click();
}

test('the agent wizard walks to Review at 375px', async ({ admin }) => {
  test.setTimeout(4 * 60_000);
  await open(admin, '/customize/agents/new');

  // --- Details ------------------------------------------------------------
  await expectWizardStep(admin, 'Details');
  await expect(admin.getByText(/^Step 1 of \d+ · Details$/)).toBeVisible();
  await fillAgentDetails(admin, {
    name: NAME,
    description: 'Phone walk of the Playwright suite; never created.',
    instructions: 'You are a test agent.',
  });
  await expectNoHorizontalScroll(admin, 'Details');
  // A reload brings the input back with the draft note, which fits the phone
  // too (giantswarm/giantswarm#38775).
  await reloadAccepting(admin);
  await expectWizardStep(admin, 'Details');
  await expect(
    admin.getByRole('textbox', { name: 'Name', exact: true }),
  ).toHaveValue(NAME);
  await expect(admin.getByText('Your draft is back')).toBeVisible();
  await expectNoHorizontalScroll(admin, 'Details with the draft note');
  await continueFrom(admin, 'Details');

  // --- Skills -------------------------------------------------------------
  await expectWizardStep(admin, 'Skills');
  await expect(admin.getByText(/^Step 2 of \d+ · Skills$/)).toBeVisible();
  await expectNoHorizontalScroll(admin, 'Skills');
  await continueFrom(admin, 'Skills');

  // --- Tools: the access radio, a connector's Read-only / All ------------
  await expectWizardStep(admin, 'Tools');
  await expect(admin.getByText(/^Step 3 of \d+ · Tools$/)).toBeVisible();
  await expect(
    admin.getByRole('complementary', { name: 'Selected' }),
    'no docked rail on a phone',
  ).toHaveCount(0);
  const summary = admin.getByRole('region', { name: 'Selected so far' });
  await expect(summary).toBeVisible();
  await expect(summary.getByText('No tools')).toBeVisible();
  await expectNoHorizontalScroll(admin, 'Tools');

  await admin
    .getByRole('radiogroup', { name: 'What it may do' })
    .getByRole('radio', { name: /Only the tools I choose below/ })
    .check();
  // A connector's Read-only / All: a two-way choice per connector (a radio
  // group), on screen at 375px. Layout and presence only — what a pick does
  // to the radio above is the tools step's own business (T81b).
  const connector = admin
    .getByRole('group', { name: /^Connector / })
    .filter({
      has: admin.getByRole('radio', { name: 'Read-only', disabled: false }),
    })
    .first();
  await expect(connector).toBeVisible({ timeout: 60_000 });
  const access = connector.getByRole('radiogroup', { name: /^Access to / });
  const all = access.getByRole('radio', { name: 'All', exact: true });
  const readOnly = access.getByRole('radio', {
    name: 'Read-only',
    exact: true,
  });
  // Both choices sit inside the phone's width (scrolled to, they may start
  // below the fold).
  for (const choice of [readOnly, all]) {
    await choice.scrollIntoViewIfNeeded();
    const box = (await choice.boundingBox())!;
    expect(box.x, 'the choice starts on the screen').toBeGreaterThanOrEqual(0);
    expect(
      box.x + box.width,
      'the choice ends on the screen',
    ).toBeLessThanOrEqual(375);
  }
  await all.click();
  await expect(all).toBeChecked();
  await expect(
    summary.getByText('No tools'),
    'the summary bar follows the pick',
  ).toHaveCount(0);
  await readOnly.click();
  await expect(readOnly).toBeChecked();
  await expect(all).not.toBeChecked();
  await expectNoHorizontalScroll(admin, 'Tools with a connector picked');
  // Back to nothing outside the chat: the review then needs no tools.
  await admin
    .getByRole('radiogroup', { name: 'What it may do' })
    .getByRole('radio', { name: /Nothing outside the chat/ })
    .check();
  await continueFrom(admin, 'Tools');

  // --- Review: agent-manager's dry run ------------------------------------
  await expectWizardStep(admin, 'Review');
  await expect(admin.getByText(/^Step 4 of \d+ · Review$/)).toBeVisible();
  await expect(admin.getByText(NAME).first()).toBeVisible();
  const create = admin.getByRole('button', { name: 'Create agent' }).first();
  await expect(
    create,
    'the dry run through agent-manager completed and Create is offered',
  ).toBeEnabled({ timeout: 90_000 });
  await expectClearOfBottomBar(admin, create, 'Create agent');
  await expectNoHorizontalScroll(admin, 'Review');
});
