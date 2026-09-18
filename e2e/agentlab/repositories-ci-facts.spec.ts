import type { Locator, Page } from '@playwright/test';

import { expect, open, test } from './fixtures';

/**
 * The CI facts of the Repositories page (giantswarm/backstage#2470) against
 * a lab whose muster serves giantswarm-repo-manager (see repositories.spec.ts
 * for the lab's shape; the suite is skipped until AGENTLAB_REPO_MANAGER=1).
 *
 * The Tooling card of an expanded row answers, from the record alone,
 * whether CircleCI builds the repository and built its latest release, which
 * architect orb it runs, whether it ships arm64 images, how they reach China
 * and whether they are signed -- each in the record's words, a dash where the
 * repository has no CircleCI configuration to say. The filter column narrows
 * the listing by them through the manager. What the manager serves is the
 * lab's business: the specs pin the vocabulary and a filter's effect on the
 * rows, not the values.
 */
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

/** Expands a row to its record. */
async function expand(page: Page, row: Locator): Promise<Locator> {
  const name = await nameOf(row);
  await row.getByRole('button', { name: EXPAND }).click();
  const record = page.getByTestId(`record-${name}`);
  await expect(record).toBeVisible({ timeout: 60_000 });
  return record;
}

/** The value of one fact of a record, by its label: the cards are definition lists. */
function factOf(record: Locator, label: string): Locator {
  return record
    .locator('dt', { hasText: new RegExp(`^${label}$`) })
    .locator('xpath=following-sibling::dd[1]');
}

/** The record's vocabulary for each CI fact; a dash where the record says nothing. */
const CI_FACTS: Record<string, RegExp> = {
  Orb: /^(architect \d+\.\d+\.\d+|—)$/,
  Images: /^(arm64|amd64 only|—)$/,
  'China push': /^(split|inline|custom|none|—)$/,
  Signing: /^(signed|unsigned(: .+)?|unknown|none|—)$/,
};

test.describe('repositories: CI facts', () => {
  test.skip(
    !process.env.AGENTLAB_REPO_MANAGER,
    'needs a lab whose muster serves giantswarm-repo-manager and whose Backstage enables page:repositories; set AGENTLAB_REPO_MANAGER=1',
  );

  test('the Tooling card answers the CI questions from the record, in its words', async ({
    admin,
  }) => {
    await open(admin, '/repositories?scope=all');
    const first = rows(admin).first();
    await expect(first).toBeVisible({ timeout: 60_000 });
    const record = await expand(admin, first);
    await expect(
      record.getByRole('heading', { name: 'Tooling' }),
    ).toBeVisible();

    // The four facts from the CircleCI configuration are always listed.
    for (const [label, words] of Object.entries(CI_FACTS)) {
      await expect(factOf(record, label), label).toHaveText(words);
    }
    // The builds are listed when the record has a CircleCI project and a
    // release to speak of: the head's statuses, the tag commit's statuses.
    const circleci = factOf(record, 'CircleCI');
    if (await circleci.count()) {
      await expect(circleci).toHaveText(
        /^(builds \S+: \S+ \(\d+ jobs?, .+\)|followed|not followed)$/,
      );
    }
    const release = factOf(record, 'Release build');
    if (await release.count()) {
      await expect(release).toHaveText(/^(built: \S+ \(\d+ jobs?, .+\)|—)$/);
    }
    // Nothing about a pipeline the record does not carry.
    await expect(record.getByText(/pipeline #/)).toHaveCount(0);
  });

  test('the Signing filter narrows the rows through the manager', async ({
    admin,
  }) => {
    await open(admin, '/repositories?scope=all');
    const summary = admin.getByTestId('listing-summary');
    await expect(summary).toContainText(/matching repositories/, {
      timeout: 60_000,
    });
    const before = await rows(admin).count();

    await admin
      .getByRole('group', { name: 'Signing' })
      .getByRole('radio', { name: 'Signed' })
      .click();
    await expect(admin).toHaveURL(/signing=signed/);
    await expect(summary).toContainText(/\(filtered\)/, { timeout: 60_000 });
    const listed = rows(admin);
    expect(await listed.count()).toBeLessThanOrEqual(before);

    // Every row the manager answered with is one whose record says so.
    if ((await listed.count()) > 0) {
      const record = await expand(admin, listed.first());
      await expect(factOf(record, 'Signing')).toHaveText('signed');
    }
  });
});
