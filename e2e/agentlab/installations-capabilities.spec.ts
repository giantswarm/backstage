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
 * registry lists, which are opted in, what the definition asks. The specs pin
 * the page's behaviour on whatever the manager serves: a column per
 * capability, the tab's state and dry run, the form from the schema, Commit
 * disabled without a grant, the not-opted-in state.
 */
const CAPABILITY = process.env.AGENTLAB_CAPABILITY ?? 'agent-platform';

/** The installations table's rows. */
function rows(page: Page): Locator {
  return page.locator('table').first().locator('tbody tr');
}

/** Opens the Capabilities tab of the installation a row names. */
async function openCapabilities(page: Page, row: Locator): Promise<void> {
  await row.getByRole('link').first().click();
  await page.getByRole('tab', { name: 'Capabilities' }).click();
  await expect(page).toHaveURL(/\/capabilities$/);
  await expect(page.getByTestId(`capability-${CAPABILITY}`)).toBeVisible({
    timeout: 120_000,
  });
}

/** Opens Enable or Reconcile (whichever the card offers) and reviews the dry run. */
async function review(page: Page): Promise<Locator> {
  const card = page.getByTestId(`capability-${CAPABILITY}`);
  await card.getByRole('button', { name: /^(Enable|Reconcile)$/ }).click();
  const dialog = page.getByRole('form', {
    name: new RegExp(`${CAPABILITY} on`),
  });
  await expect(dialog).toBeVisible();
  // The form is the definition's schema: its installation group is prefilled
  // from the record, its choices are not made for the person.
  await expect(dialog.getByTestId('group-installation')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Review' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Review' }).click();
  await expect(dialog.getByTestId('plan')).toBeVisible({ timeout: 120_000 });
  return dialog;
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
      // Every cell is a state in the manager's words, or a dash for an
      // installation the registry does not know.
      expect(state ?? text).toMatch(
        /^(not opted in|not enabled|pending approval|rolling out|waiting for the customer|enabled|drifted|failed|unknown|—)$/,
      );
    }
    // Nothing of the automation happens from the list: no button in the cells.
    await expect(cells.first().getByRole('button')).toHaveCount(0);
  });

  test('the Capabilities tab shows the state and the dry run from the form', async ({
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
    await expect(card.getByTestId('last-action')).toBeVisible();
    await expect(card.getByRole('button', { name: 'Verify' })).toBeVisible();
    await expect(admin.getByTestId('action-history')).toBeVisible();

    const dialog = await review(admin);
    // The plan is the manager's: files by repository or the definition's
    // refusal of the inputs left unchosen -- either is shown, nothing else.
    await expect(
      dialog
        .getByTestId('plan-files')
        .or(dialog.getByText('Refused by the definition'))
        .or(dialog.getByText('A commit would be refused'))
        .first(),
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
  });

  test('Commit is disabled without the manager grant', async ({ admin }) => {
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
      const dialog = await review(admin);
      const commit = dialog.getByRole('button', { name: 'Commit' });
      if ((await commit.count()) > 0) {
        await expect(commit).toBeDisabled();
        await expect(dialog.getByText('Commit needs your grant')).toBeVisible();
      } else {
        // A commit the manager would refuse anyway (not opted in) has no
        // button at all; the note says why.
        await expect(
          dialog.getByText('A commit would be refused'),
        ).toBeVisible();
      }
      await dialog.getByRole('button', { name: 'Cancel' }).click();
    } finally {
      await admin.unroute('**/api/platform-capabilities/connection');
    }
  });

  test('an installation not opted in shows the file path and the pull request, and no Commit', async ({
    admin,
  }) => {
    await open(admin, '/installations');
    const notOptedIn = admin
      .locator(
        `[data-testid^="capability-${CAPABILITY}-"][data-state="not opted in"]`,
      )
      .first();
    await expect(rows(admin).first()).toBeVisible({ timeout: 120_000 });
    test.skip(
      (await notOptedIn.count()) === 0,
      'every installation of the lab registry is opted in; the not-opted-in state needs one that is not',
    );
    const row = rows(admin).filter({ has: notOptedIn }).first();
    await openCapabilities(admin, row);
    const note = admin
      .getByTestId(`capability-${CAPABILITY}`)
      .getByTestId('opt-in-note');
    await expect(note).toContainText('platform-manager.yaml');
    await expect(
      note
        .getByRole('link', { name: 'The pull request that adds it' })
        .or(note.getByText(/pull request/i))
        .first(),
    ).toBeVisible();

    const dialog = await review(admin);
    await expect(dialog.getByRole('button', { name: 'Commit' })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
  });
});
