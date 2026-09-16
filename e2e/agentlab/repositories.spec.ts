import type { Page } from '@playwright/test';

import { expect, open, signIn, test } from './fixtures';
import { lab } from './lab';

/**
 * The Repositories page (giantswarm/backstage#2398) against a lab whose
 * muster serves giantswarm-repo-manager's tools (the manager image, or a
 * fixture MCP server registered as `giantswarm-repo-manager`) and whose
 * Backstage names `page:repositories` and `api:repositories` in
 * `app.extensions` with `repositories.muster` pointing at that server. The
 * suite is skipped with the reason until AGENTLAB_REPO_MANAGER=1 says the lab
 * has it.
 *
 * What the tools answer is the lab's business; the specs pin the page's
 * behaviour on whatever inventory the manager serves: the default scope, the
 * switch to All, a row's record, and the sign-in a person without a grant is
 * guided through.
 */
const MANAGER_TOOL = /x_giantswarm-repo-manager_/;

async function rows(page: Page) {
  return page
    .getByRole('table', { name: 'Repositories' })
    .locator('tbody tr[data-testid^="row-"]');
}

test.describe('repositories', () => {
  test.skip(
    !process.env.AGENTLAB_REPO_MANAGER,
    'needs a lab whose muster serves giantswarm-repo-manager and whose Backstage enables page:repositories; set AGENTLAB_REPO_MANAGER=1',
  );

  test('opens on My team and lists the inventory', async ({ admin }) => {
    await open(admin, '/repositories');
    await expect(
      admin.getByRole('tab', { name: 'My team', selected: true }),
    ).toBeVisible();
    await expect(admin.getByTestId('listing-summary')).toContainText(
      /matching repositories/,
      { timeout: 60_000 },
    );
    await expect(admin.getByTestId('tile-set-up-state')).toBeVisible();
    await expect(admin.getByTestId('tile-orphan-score')).toBeVisible();
    await expect(
      admin.getByRole('table', { name: 'Repositories' }),
    ).toBeVisible();
  });

  test('switches to All repositories and keeps the scope in the URL', async ({
    admin,
  }) => {
    await open(admin, '/repositories');
    await admin.getByRole('tab', { name: 'All repositories' }).click();
    await expect(admin).toHaveURL(/scope=all/);
    await expect(admin.getByTestId('listing-summary')).toContainText(
      /in the inventory/,
      { timeout: 60_000 },
    );
    const listed = await rows(admin);
    expect(await listed.count()).toBeGreaterThan(0);
  });

  test('expands a row to the record with its set-up steps and Refresh', async ({
    admin,
  }) => {
    await open(admin, '/repositories?scope=all');
    const listed = await rows(admin);
    await expect(listed.first()).toBeVisible({ timeout: 60_000 });
    const name = (await listed.first().getAttribute('data-testid'))!.replace(
      /^row-/,
      '',
    );
    await listed
      .first()
      .getByRole('button', { name: /^Expand / })
      .click();

    const record = admin.getByTestId(`record-${name}`);
    await expect(record).toBeVisible({ timeout: 60_000 });
    await expect(
      record.getByText(/^Record from (sweep|refresh|reconciler), .* old/),
    ).toBeVisible();
    await expect(record.getByRole('button', { name: 'Refresh' })).toBeVisible();
    // A record whose checks ran shows the CLI's table; one whose checks could
    // not run says so. Either is the manager's truth.
    await expect(
      record
        .getByRole('table', { name: 'Set-up' })
        .or(record.getByText(/^Set-up not checked/)),
    ).toBeVisible();
  });

  test('a person without a grant is sent through the connect and lands back', async ({
    page,
  }) => {
    // The viewer never connected to the manager: muster answers the first
    // tool call with the sign-in, the page follows it, Dex knows the session
    // and redirects straight back with the grant in place.
    await signIn(page, lab.users.viewer);
    const managerCalls: string[] = [];
    page.on('request', request => {
      if (MANAGER_TOOL.test(request.postData() ?? '')) {
        managerCalls.push(request.url());
      }
    });
    await page.goto('/repositories');
    await expect(page.getByTestId('listing-summary')).toContainText(
      /matching repositories/,
      { timeout: 120_000 },
    );
    await expect(page).toHaveURL(/\/repositories/);
    await expect(page.getByRole('button', { name: 'Connect' })).toHaveCount(0);
  });
});
