import type { Locator, Page } from '@playwright/test';

import { expect, open, test } from './fixtures';

/**
 * The Consistency view of a platform capability under Installations
 * (giantswarm/backstage#2443): every installation of the registry against
 * the capability's definition, one column per feature, each cell a mark from
 * `verify_capability`. Same lab as `installations-capabilities.spec.ts`:
 * muster serving giantswarm-platform-manager, Backstage with
 * `api:platform-capabilities`; skipped until AGENTLAB_PLATFORM_MANAGER=1.
 *
 * The marks are the manager's answers about the lab's repositories. The two
 * marks that need a prepared fixture -- a deliberate live change in a
 * repository file (*drifted*) and an input changed against the record
 * (*differs by input*) -- are named by the lab run through
 * AGENTLAB_CONSISTENCY_DRIFTED and AGENTLAB_CONSISTENCY_DIFFERS as
 * `<installation>/<feature>`; without them that test is skipped with the
 * reason.
 */
const CAPABILITY = process.env.AGENTLAB_CAPABILITY ?? 'agent-platform';
const VIEW = `/installations/consistency/${encodeURIComponent(CAPABILITY)}`;
const MARK = /^(as defined|differs by input|drifted|not checked|not readable)$/;
/** One `verify_capability` renders the installation and reads its repositories. */
const VERIFY_TIMEOUT = 180_000;

function table(page: Page): Locator {
  return page.getByTestId(`consistency-${CAPABILITY}`);
}

function rows(page: Page): Locator {
  return table(page).locator('tbody tr[data-testid^="consistency-row-"]');
}

function cell(page: Page, installation: string, feature: string): Locator {
  return page.getByTestId(`consistency-cell-${installation}-${feature}`);
}

/** Opens the view and waits for every row's comparison to answer or fail. */
async function openSettled(page: Page): Promise<void> {
  await open(page, VIEW);
  await expect(table(page)).toBeVisible({ timeout: 120_000 });
  await expect(rows(page).first()).toBeVisible({ timeout: 120_000 });
  for (const row of await rows(page).all()) {
    await expect(
      row
        .locator('[data-testid^="consistency-cell-"]')
        .first()
        .or(row.locator('[data-testid^="consistency-error-"]'))
        .or(row.locator('[data-testid^="consistency-readability-"]'))
        .first(),
    ).toBeVisible({ timeout: VERIFY_TIMEOUT });
  }
}

/** `<installation>/<feature>` from the environment, or undefined. */
function fixture(name: string): [string, string] | undefined {
  const value = process.env[name];
  if (!value?.includes('/')) {
    return undefined;
  }
  const [installation, feature] = value.split('/', 2);
  return [installation, feature];
}

test.describe('installations: the Consistency view', () => {
  test.skip(
    !process.env.AGENTLAB_PLATFORM_MANAGER,
    'needs a lab whose muster serves giantswarm-platform-manager and whose Backstage enables api:platform-capabilities; set AGENTLAB_PLATFORM_MANAGER=1',
  );

  test('a tab of the Installations page lists every installation of the registry against the definition’s features', async ({
    admin,
  }) => {
    await open(admin, '/installations');
    const tab = admin
      .getByRole('tab', { name: `Consistency: ${CAPABILITY}` })
      .or(admin.getByRole('link', { name: `Consistency: ${CAPABILITY}` }))
      .first();
    await expect(tab).toBeVisible({ timeout: 120_000 });
    await tab.click();
    await expect(admin).toHaveURL(new RegExp(`${VIEW}$`));
    await expect(table(admin)).toBeVisible({ timeout: 120_000 });

    // One column per feature of the definition, the installation first.
    await expect(
      admin.getByRole('columnheader', { name: 'Installation' }),
    ).toBeVisible();
    const features = admin.locator('[data-testid^="consistency-column-"]');
    expect(await features.count()).toBeGreaterThan(0);

    await openSettled(admin);
    const count = await rows(admin).count();
    expect(count).toBeGreaterThan(0);
    // Every cell is a mark in the manager's words.
    const cells = admin.locator('[data-testid^="consistency-cell-"]');
    for (const c of await cells.all()) {
      expect(await c.getAttribute('data-mark')).toMatch(MARK);
    }
    // Verify now per installation; nothing of the automation from here.
    await expect(
      admin.getByRole('button', { name: /^Verify .+ now$/ }),
    ).toHaveCount(count);
    await expect(
      admin.getByRole('button', { name: /^(Enable|Reconcile|Commit)$/ }),
    ).toHaveCount(0);
  });

  test('the three marks after a deliberate live change and a changed input, and a cell expands to its dimensions', async ({
    admin,
  }) => {
    const drifted = fixture('AGENTLAB_CONSISTENCY_DRIFTED');
    const differs = fixture('AGENTLAB_CONSISTENCY_DIFFERS');
    test.skip(
      !drifted || !differs,
      'needs the lab fixture: a repository file changed by hand and an input changed against the record, named as AGENTLAB_CONSISTENCY_DRIFTED=<installation>/<feature> and AGENTLAB_CONSISTENCY_DIFFERS=<installation>/<feature>',
    );
    await openSettled(admin);

    const [driftedInstallation, driftedFeature] = drifted!;
    const [differsInstallation, differsFeature] = differs!;
    await expect(
      cell(admin, driftedInstallation, driftedFeature),
    ).toHaveAttribute('data-mark', 'drifted');
    await expect(
      cell(admin, differsInstallation, differsFeature),
    ).toHaveAttribute('data-mark', 'differs by input');
    await expect(
      admin
        .locator('[data-testid^="consistency-cell-"][data-mark="as defined"]')
        .first(),
    ).toBeVisible();

    // The drifted cell expands to its dimensions: the one that drifted names
    // the file and path with the rendered and the current value.
    await cell(admin, driftedInstallation, driftedFeature).click();
    const panel = admin.getByTestId(`consistency-panel-${driftedInstallation}`);
    await expect(panel).toBeVisible();
    const dimension = panel
      .locator('[data-testid^="dimension-"][data-mark="drifted"]')
      .first();
    await expect(dimension).toBeVisible();
    await expect(dimension).toContainText('rendered');
    await expect(dimension).toContainText('current');

    // The differing cell names the input driving the difference.
    await cell(admin, differsInstallation, differsFeature).click();
    await expect(
      admin
        .getByTestId(`consistency-panel-${differsInstallation}`)
        .locator('[data-testid^="dimension-"][data-mark="differs by input"]')
        .first(),
    ).toContainText('(input ');

    // The row expands to the installation's inputs on record.
    await admin
      .getByTestId(`consistency-row-${driftedInstallation}`)
      .getByRole('button', { name: new RegExp(`^${driftedInstallation}`) })
      .click();
    await expect(
      admin
        .getByTestId(`consistency-panel-${driftedInstallation}`)
        .getByTestId('consistency-inputs'),
    ).toBeVisible();
  });

  test('Verify now runs the comparison again for that installation', async ({
    admin,
  }) => {
    await openSettled(admin);
    const first = rows(admin).first();
    const name = (await first.getAttribute('data-testid'))!.replace(
      'consistency-row-',
      '',
    );
    const verifyUrl = `/api/platform-capabilities/installations/${encodeURIComponent(
      name,
    )}/capabilities/${encodeURIComponent(CAPABILITY)}/verify`;
    let calls = 0;
    const count = (request: { url(): string; method(): string }) => {
      if (request.method() === 'POST' && request.url().includes(verifyUrl)) {
        calls++;
      }
    };
    admin.on('request', count);
    try {
      await admin.getByRole('button', { name: `Verify ${name} now` }).click();
      await expect.poll(() => calls, { timeout: VERIFY_TIMEOUT }).toBe(1);
      await expect(
        admin.getByRole('button', { name: `Verify ${name} now` }),
      ).toBeEnabled({ timeout: VERIFY_TIMEOUT });
      const marks = first.locator('[data-testid^="consistency-cell-"]');
      for (const c of await marks.all()) {
        expect(await c.getAttribute('data-mark')).toMatch(MARK);
      }
    } finally {
      admin.off('request', count);
    }
  });

  test('a person without RBAC on an installation sees its probes as not readable, not as drift', async ({
    admin,
  }) => {
    // The portal reads an installation as the person through the kubernetes
    // proxy; its inventory probe (`GET /apis`) is what says whether the
    // person may. An apiserver that refuses the person answers 403, stood in
    // for at the browser.
    const refuse = (route: {
      fulfill(response: { status: number; json: unknown }): Promise<void>;
    }) =>
      route.fulfill({
        status: 403,
        json: { kind: 'Status', code: 403, reason: 'Forbidden' },
      });
    await admin.route('**/kubernetes/proxy/apis', refuse);
    await admin.route('**/kubernetes/proxy/apis?*', refuse);
    try {
      await openSettled(admin);
      const notReadable = admin.locator(
        '[data-testid^="consistency-readability-"]',
      );
      await expect(notReadable.first()).toBeVisible({ timeout: 120_000 });
      await expect(notReadable.first()).toHaveText('not readable');

      // On that row, the dimensions that read the installation live are
      // not readable; whatever the manager's own probe answered is not drift.
      const row = rows(admin).filter({ has: notReadable.first() }).first();
      const cells = row.locator('[data-testid^="consistency-cell-"]');
      let liveShown = false;
      for (const c of await cells.all()) {
        await c.click();
        const panel = admin.locator('[data-testid^="consistency-panel-"]');
        await expect(panel).toBeVisible();
        if (
          (await panel
            .locator('[data-testid^="dimension-"][data-mark="not readable"]')
            .count()) > 0
        ) {
          liveShown = true;
          break;
        }
        await c.click();
      }
      expect(liveShown, 'a live dimension of the row reads not readable').toBe(
        true,
      );
    } finally {
      await admin.unroute('**/kubernetes/proxy/apis', refuse);
      await admin.unroute('**/kubernetes/proxy/apis?*', refuse);
    }
  });
});
