import type { Locator, Page } from '@playwright/test';

import { expect, open, test } from './fixtures';

/**
 * Platform capabilities on the Installations page (giantswarm/backstage#2442)
 * against a lab whose muster serves giantswarm-platform-manager's tools and
 * whose Backstage names `api:platform-capabilities` and
 * `entity-content:platform-capabilities/capabilities` in `app.extensions`
 * with `platformCapabilities.muster` pointing at that server. The suite is
 * skipped with the reason until AGENTLAB_PLATFORM_MANAGER=1 says the lab has
 * it.
 *
 * What the tools answer is the lab's business: which installations the
 * registry lists, what the definition asks. The specs pin
 * the page's behaviour on whatever the manager serves: a column per
 * capability, the tab's state and dry run, the form from the schema, Commit
 * disabled without a grant, Enable where nothing is on record.
 */
const CAPABILITY = process.env.AGENTLAB_CAPABILITY ?? 'agent-platform';

/** The installations table's rows. */
function rows(page: Page): Locator {
  return page.locator('table').first().locator('tbody tr');
}

/** Opens the Capabilities tab of the installation a row names. */
async function openCapabilities(page: Page, row: Locator): Promise<void> {
  await row.getByRole('link').first().click();
  // The entity page's content navigation renders its entries as links (a
  // tab on older layouts).
  await page
    .getByRole('link', { name: 'Capabilities', exact: true })
    .or(page.getByRole('tab', { name: 'Capabilities' }))
    .first()
    .click();
  await expect(page).toHaveURL(/\/capabilities$/);
  await expect(page.getByTestId(`capability-${CAPABILITY}`)).toBeVisible({
    timeout: 120_000,
  });
}

/** What a review comes to: the plan, or the manager's refusal alone. */
interface Review {
  dialog: Locator;
  outcome: 'plan' | 'refused';
}

/**
 * Opens Enable or Apply changes (whichever the block offers) and reviews the
 * comparison: the plan where the manager renders one, the refusal alone
 * where it would refuse (a record the definition's schema rejects). Both are
 * valid reviews.
 */
async function review(page: Page): Promise<Review> {
  const card = page.getByTestId(`capability-${CAPABILITY}`);
  await card.getByRole('button', { name: /^(Enable|Apply changes)$/ }).click();
  const dialog = page.getByRole('form', {
    name: new RegExp(`${CAPABILITY} on`),
  });
  await expect(dialog).toBeVisible();
  // The form is the person's part of the definition's schema, opened with
  // the choices on record: the registry's facts are not asked, no control
  // is named after the `enabled` leaf alone.
  await expect(dialog.getByTestId('group-root')).toBeVisible();
  await expect(dialog.getByTestId('group-installation')).toHaveCount(0);
  await expect(dialog.getByLabel(/^enabled/i)).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Review' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Review' }).click();
  const plan = dialog.getByTestId('plan');
  const refused = dialog.getByTestId('refused');
  await expect(plan.or(refused).first()).toBeVisible({ timeout: 120_000 });
  return { dialog, outcome: (await plan.count()) > 0 ? 'plan' : 'refused' };
}

test.describe('installations: platform capabilities', () => {
  test.skip(
    !process.env.AGENTLAB_PLATFORM_MANAGER,
    'needs a lab whose muster serves giantswarm-platform-manager and whose Backstage enables api:platform-capabilities; set AGENTLAB_PLATFORM_MANAGER=1',
  );

  test('the list has one column per capability with the state of every installation', async ({
    admin,
  }) => {
    await open(admin, '/installations');
    await expect(
      admin.getByRole('columnheader', { name: CAPABILITY }),
    ).toBeVisible({ timeout: 120_000 });
    const cells = admin.locator(`[data-testid^="capability-${CAPABILITY}-"]`);
    await expect(cells.first()).toBeVisible({ timeout: 120_000 });
    for (const cell of await cells.all()) {
      const state = await cell.getAttribute('data-state');
      const text = (await cell.innerText()).trim();
      // Every cell is one icon: `data-state` is the manager's word, its name
      // the tab's words for it; a dash for an installation the registry
      // does not know.
      expect(state ?? text).toMatch(
        /^(not enabled|pending approval|rolling out|waiting for the customer|enabled|drifted|failed|unknown|—)$/,
      );
      if (state) {
        expect(text).toBe('');
        await expect(cell).toHaveAttribute(
          'aria-label',
          /^(Installed( · differences)?|Not installed|(Enabling|Applying) · (pending approval|rolling out)|Waiting for the customer|Failed|Unknown)$/,
        );
        await expect(cell).toHaveAttribute(
          'data-mark',
          /^(in sync|not in sync|not reconciled|not installed|failed|unknown)$/,
        );
      }
    }
    // Nothing of the automation happens from the list: no button in the cells.
    await expect(cells.first().getByRole('button')).toHaveCount(0);
  });

  test('the Capabilities tab shows the block and the review from the form', async ({
    admin,
  }) => {
    await open(admin, '/installations');
    const first = rows(admin).first();
    await expect(first).toBeVisible({ timeout: 120_000 });
    await openCapabilities(admin, first);
    const card = admin.getByTestId(`capability-${CAPABILITY}`);
    await expect(card.getByTestId('capability-state')).toHaveAttribute(
      'data-state',
      /.+/,
    );
    // The comparison ran as the tab opened: no Verify button, the person's
    // one choice on its row of the record.
    await expect(card.getByRole('button', { name: 'Verify' })).toHaveCount(0);
    await expect(card.getByTestId('choice-modelServing.enabled')).toHaveText(
      /^(on|off)$/,
    );
    await expect(admin.getByTestId('action-history')).toBeVisible();

    const { dialog, outcome } = await review(admin);
    // The review is the manager's: the plan's files by repository, or the
    // reason it would refuse -- one of the two is shown, nothing else.
    if (outcome === 'plan') {
      await expect(dialog.getByTestId('plan-files')).toBeVisible();
      await expect(dialog.getByTestId('refused')).toHaveCount(0);
    } else {
      await expect(
        dialog.getByText('The manager would refuse this'),
      ).toBeVisible();
      await expect(dialog.getByTestId('plan')).toHaveCount(0);
    }
    await dialog.getByRole('button', { name: 'Cancel' }).click();
  });

  test('Open pull requests is disabled without the session', async ({
    admin,
  }) => {
    // The person's session is connected (the admin page bounced through
    // muster's connect on its first read); the connection check is what
    // Commit follows, so a session the manager does not know is stood in for
    // by that answer alone.
    await admin.route('**/api/platform-capabilities/connection', route =>
      route.fulfill({
        json: {
          connected: false,
          message: 'no grant for giantswarm-platform-manager',
        },
      }),
    );
    try {
      await open(admin, '/installations');
      const first = rows(admin).first();
      await expect(first).toBeVisible({ timeout: 120_000 });
      await openCapabilities(admin, first);
      const { dialog, outcome } = await review(admin);
      const commit = dialog.getByRole('button', { name: 'Open pull requests' });
      if (outcome === 'refused') {
        // A commit the manager would refuse has no button at all.
        await expect(commit).toHaveCount(0);
      } else if ((await commit.count()) > 0) {
        await expect(commit).toBeDisabled();
        await expect(dialog.getByText('Needs your session')).toBeVisible();
      } else {
        // A plan with nothing to open has no button either; the dialog says so.
        await expect(
          dialog.getByText('No pull request: every file is as defined.'),
        ).toBeVisible();
      }
      await dialog.getByRole('button', { name: 'Cancel' }).click();
    } finally {
      await admin.unroute('**/api/platform-capabilities/connection');
    }
  });

  test('an installation with nothing on record offers Enable', async ({
    admin,
  }) => {
    await open(admin, '/installations');
    const notEnabled = admin
      .locator(
        `[data-testid^="capability-${CAPABILITY}-"][data-state="not enabled"]`,
      )
      .first();
    await expect(rows(admin).first()).toBeVisible({ timeout: 120_000 });
    // The cells render once the listing has arrived; count after that.
    await expect(
      admin.locator(`[data-testid^="capability-${CAPABILITY}-"]`).first(),
    ).toBeVisible({ timeout: 120_000 });
    test.skip(
      (await notEnabled.count()) === 0,
      'every installation of the lab registry has the capability on record; Enable needs one without it',
    );
    const row = rows(admin).filter({ has: notEnabled }).first();
    await openCapabilities(admin, row);
    const card = admin.getByTestId(`capability-${CAPABILITY}`);
    // Nothing on record: Enable is the person's to click.
    await expect(card.getByRole('button', { name: 'Enable' })).toBeEnabled({
      timeout: 120_000,
    });
  });
});
