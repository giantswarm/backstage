import type { Locator, Page } from '@playwright/test';

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
 * switch to All, the archived repositories hidden until asked for, the team
 * filter, a row's record, and the sign-in a person without a grant is guided
 * through.
 */
const MANAGER_TOOL = /x_giantswarm-repo-manager_/;

const EXPAND = 'Detail panel visiblity toggle';

/** The inventory table's rows (the first table on the page; a record's steps table comes after). */
function rows(page: Page): Locator {
  return page.locator('table').first().locator('tbody tr');
}

/** The repository named in a row, without the org. */
async function nameOf(row: Locator): Promise<string> {
  const text = (await row.locator('td').nth(1).innerText()).trim();
  return text.replace(/^[^/]+\//, '').split(/\s/)[0];
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
    // No tiles, no score: the filters column and the table.
    await expect(admin.getByTestId('repositories-filters')).toBeVisible();
    await expect(admin.getByText('Orphan score')).toHaveCount(0);
    await expect(admin.locator('table').first()).toBeVisible();
    await expect(
      admin.getByRole('checkbox', { name: 'Show archived' }),
    ).not.toBeChecked();
  });

  test('hides the archived repositories until Show archived', async ({
    admin,
  }) => {
    await open(admin, '/repositories?scope=all');
    const summary = admin.getByTestId('listing-summary');
    await expect(summary).toContainText(/archived hidden/, {
      timeout: 60_000,
    });
    const hidden = await rows(admin).count();

    await admin.getByRole('checkbox', { name: 'Show archived' }).click();
    await expect(admin).toHaveURL(/archived=true/);
    await expect(summary).not.toContainText(/archived hidden/, {
      timeout: 60_000,
    });
    expect(await rows(admin).count()).toBeGreaterThanOrEqual(hidden);
  });

  test('the Team filter narrows the rows to that team', async ({ admin }) => {
    await open(admin, '/repositories?scope=all');
    await expect(rows(admin).first()).toBeVisible({ timeout: 60_000 });
    await admin.getByRole('combobox', { name: /^Team/ }).click();
    const team = admin
      .getByRole('option')
      .filter({ hasNotText: 'No team' })
      .first();
    const chosen = (await team.innerText()).trim();
    await team.click();
    await expect(admin).toHaveURL(new RegExp(`team=${chosen}`));
    await expect(admin.getByTestId('listing-summary')).toContainText(
      /\(filtered\)/,
      { timeout: 60_000 },
    );
    const listed = rows(admin);
    await expect(listed.first()).toBeVisible({ timeout: 60_000 });
    for (const row of await listed.all()) {
      await expect(row.locator('td').nth(2)).toHaveText(chosen);
    }
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
    expect(await rows(admin).count()).toBeGreaterThan(0);
  });

  test('expands a row to the record with its set-up steps and Refresh', async ({
    admin,
  }) => {
    await open(admin, '/repositories?scope=all');
    const first = rows(admin).first();
    await expect(first).toBeVisible({ timeout: 60_000 });
    const name = await nameOf(first);
    await first.getByRole('button', { name: EXPAND }).click();

    const record = admin.getByTestId(`record-${name}`);
    await expect(record).toBeVisible({ timeout: 60_000 });
    await expect(
      record.getByText(/Record from (sweep|refresh|reconciler), .* old/),
    ).toBeVisible();
    await expect(record.getByTestId('setup-state')).toBeVisible();
    await expect(record.getByRole('button', { name: 'Refresh' })).toBeVisible();
    await expect(
      record.getByRole('heading', { name: 'Ownership' }),
    ).toBeVisible();
    // A record whose checks ran shows the steps; one whose checks could not
    // run says so. Either is the manager's truth.
    await expect(
      record
        .getByTestId('setup-steps')
        .or(record.getByText(/^Set-up not checked/)),
    ).toBeVisible();
    await expect(record.getByRole('button', { name: 'Keep' })).toHaveCount(0);
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
