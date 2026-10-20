import type { Page } from '@playwright/test';
import { open } from './fixtures';
import { lab } from './lab';
import {
  deleteWorkspace,
  expect,
  OWNER,
  test,
  workspaceName,
} from './workspaces.fixture';

/**
 * The workspace editor in the agent shell, on the lab's GitHub (`fake`) and
 * its fixture repositories: Go and TypeScript, public and private, an
 * archived one and a fork. Read through the portal's muster as the admin,
 * a member of the lab's Organization.
 */

/** Full-page screenshots when `AGENTLAB_E2E_SCREENSHOTS=<dir>` is set — the PR's evidence. */
async function snapshot(page: Page, name: string): Promise<void> {
  const dir = process.env.AGENTLAB_E2E_SCREENSHOTS;
  if (dir) {
    await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
  }
}

const editorPath = (name: string) =>
  `/customize/workspaces/${lab.installation}/${lab.workspaces.organization}/${name}/edit`;

const source = (page: Page) => page.getByTestId('workspace-source-0');
const rowOf = (page: Page, name: string) =>
  page.getByRole('row').filter({
    has: page.getByRole('rowheader', { name: new RegExp(`^${name}`) }),
  });

/** Customize · Workspaces, then its New workspace, into the editor. */
async function openFromTab(page: Page): Promise<void> {
  await open(page, '/customize/workspaces');
  await page.getByRole('link', { name: 'New workspace' }).first().click();
}
const preview = (page: Page) => page.getByTestId('workspace-preview');

/** A source's filter dropdown (Language, Topics, Including). */
const filterButton = (page: Page, label: string) =>
  source(page).getByRole('button', { name: new RegExp(`^${label}:`) });

/** Ticks options in one filter dropdown, then closes it. */
async function pickFilters(
  page: Page,
  label: string,
  options: string[],
): Promise<void> {
  await filterButton(page, label).click();
  const popover = page.getByRole('dialog');
  for (const option of options) {
    await popover.getByRole('checkbox', { name: option, exact: true }).click();
  }
  await page.keyboard.press('Escape');
  await expect(popover).toHaveCount(0);
}

/** One repository's row in the source's table. */
const tableRow = (page: Page, repository: string) =>
  source(page).getByRole('checkbox', { name: repository, exact: true });

/**
 * Presses the wizard's primary action. The portal-wide notice of MCP servers
 * waiting for a sign-in sits over the footer while the lab's OAuth fixture is
 * signed out; a person puts it away with Not now first.
 */
async function pressPrimary(page: Page, name: string): Promise<void> {
  const notice = page.getByRole('complementary', {
    name: 'MCP server sign-in',
  });
  if (await notice.isVisible()) {
    await notice.getByRole('button', { name: 'Not now' }).click();
    await expect(notice).toHaveCount(0);
  }
  await page.getByRole('button', { name }).click();
}

/**
 * Names the draft and picks the lab's GitHub: with one provider instance
 * there is nothing to pick, several show a select (named "Select an option
 * Provider").
 */
async function startDraft(
  page: Page,
  name: string,
  provider: string,
): Promise<void> {
  await expect(
    page.getByRole('heading', { name: 'New workspace' }),
  ).toBeVisible({ timeout: 60_000 });
  await page.getByRole('textbox', { name: /^Name/ }).fill(name);
  const providerSelect = source(page).getByRole('button', {
    name: /Provider$/,
  });
  await expect(
    providerSelect
      .or(source(page).getByRole('textbox', { name: /^Owner/ }))
      .first(),
  ).toBeVisible({ timeout: 60_000 });
  if (await providerSelect.isVisible()) {
    await providerSelect.click();
    await page
      .getByRole('option', {
        // "GitHub" for an instance named after its kind, else "<name> (<Kind>)".
        name: new RegExp(`^${provider}( |$)`, 'i'),
      })
      .click();
  }
}

test('a member creates a workspace from a language and topic filter, previews, excludes and reopens it', async ({
  admin,
  workspaceLab,
}, testInfo) => {
  test.skip(!!workspaceLab.unavailable, workspaceLab.unavailable);
  test.setTimeout(6 * 60_000);
  const tools = await workspaceLab.tools(lab.users.admin);
  const name = workspaceName('editor', testInfo.workerIndex);
  let connected = false;

  try {
    await openFromTab(admin);
    const form = admin.getByRole('textbox', { name: /^Name/ });
    const gate = admin.getByTestId('workspace-editor-gate');
    await expect(form.or(gate)).toBeVisible({ timeout: 60_000 });
    if (await gate.isVisible()) {
      // Not granted yet: the editor asks for the sign-in in place of its
      // form. Grant the App in muster the way a person does, then open the
      // editor again.
      await expect(
        gate.getByTestId(`provider-connect-${workspaceLab.provider}`),
      ).toBeVisible();
      await expect(admin.getByRole('textbox', { name: /^Name/ })).toHaveCount(
        0,
      );
      await snapshot(admin, 'workspace-editor-sign-in-gate');
      test.skip(
        !lab.workspaces.githubFakeURL,
        'granting the lab GitHub needs AGENTLAB_GITHUB_FAKE_URL (see e2e/agentlab/README.md)',
      );
      connected = await tools.grantInMuster();
      await openFromTab(admin);
    }
    await expect(form, 'the editor opens its form').toBeVisible({
      timeout: 60_000,
    });
    await expect(
      admin.getByText(/There is no schedule|nightly|weekly/i),
      'the editor has no schedule field',
    ).toHaveCount(0);

    await startDraft(admin, name, workspaceLab.provider);
    await expect(
      admin.getByText(`${name} is available`),
      'the name is checked once typing pauses',
    ).toBeVisible({ timeout: 60_000 });
    // The owner: a pick from list_owners where the manager offers it, else
    // typed.
    const ownerText = source(admin).getByRole('textbox', { name: /^Owner/ });
    const ownerSelect = source(admin).getByRole('button', { name: /Owner/ });
    await expect(ownerText.or(ownerSelect).first()).toBeVisible({
      timeout: 60_000,
    });
    if (await ownerText.isVisible()) {
      await ownerText.fill(OWNER);
    } else {
      await ownerSelect.click();
      await admin.getByRole('option', { name: OWNER, exact: true }).click();
    }

    // Go repositories tagged api or monorepo: platform-api and monorepo; the
    // HCL platform-infra and the archived Python legacy-tool stay out.
    await pickFilters(admin, 'Language', ['Go']);
    await pickFilters(admin, 'Topics', ['api', 'monorepo']);
    await expect(source(admin).getByTestId('filter-match-total')).toHaveText(
      '2 repositories match',
      { timeout: 60_000 },
    );

    await expect(
      preview(admin).getByText(`${OWNER}/platform-api`, { exact: true }),
      'the preview lists the matching public repositories before saving',
    ).toBeVisible({ timeout: 60_000 });
    await expect(
      preview(admin).getByText(`${OWNER}/monorepo`, { exact: true }),
    ).toBeVisible();
    await expect(preview(admin).getByTestId('preview-total')).toContainText(
      '2 repositories',
    );
    for (const outside of ['platform-infra', 'legacy-tool']) {
      await expect(
        preview(admin).getByText(`${OWNER}/${outside}`, { exact: true }),
      ).toHaveCount(0);
    }
    await snapshot(admin, 'workspace-editor-preview');

    // Unticking a filter match in the table excludes it.
    await expect(tableRow(admin, 'monorepo')).toBeChecked();
    await tableRow(admin, 'monorepo').click({ force: true });
    await expect(source(admin).getByTestId('repository-summary')).toHaveText(
      '2 by filter · 0 by name · 1 excluded = 1 repository',
    );
    await expect(
      preview(admin).getByText(`${OWNER}/monorepo`, { exact: true }),
      'the exclusion removes it from the preview',
    ).toHaveCount(0, { timeout: 60_000 });
    await expect(preview(admin).getByTestId('preview-total')).toContainText(
      '1 repository',
    );
    await expect(preview(admin)).toContainText('1 excluded: monorepo');
    await snapshot(admin, 'workspace-editor-excluded');

    await pressPrimary(admin, 'Create workspace');
    await expect(admin).toHaveURL(/\/customize\/workspaces/, {
      timeout: 60_000,
    });

    // Reopen from the tab's row menu: the same filters and the exclusion.
    const row = rowOf(admin, name);
    await expect(row, 'the new workspace is listed').toBeVisible({
      timeout: 60_000,
    });
    await row.getByRole('button', { name: `Actions for ${name}` }).click();
    await admin.getByRole('menuitem', { name: 'Edit' }).click();
    await expect(admin).toHaveURL(new RegExp(`${editorPath(name)}$`));
    await expect(filterButton(admin, 'Language')).toHaveAccessibleName(
      'Language: Go',
      { timeout: 60_000 },
    );
    await expect(filterButton(admin, 'Topics')).toHaveAccessibleName(
      'Topics: any of api, monorepo',
    );
    await expect(
      source(admin).getByRole('switch', { name: 'Selected only (1)' }),
      'the exclusion is kept',
    ).toBeVisible();
    await snapshot(admin, 'workspace-editor-reopened');

    // An edit persists: monorepo ticked again in the table rejoins the
    // preview.
    await expect(tableRow(admin, 'monorepo')).not.toBeChecked({
      timeout: 60_000,
    });
    await tableRow(admin, 'monorepo').click({ force: true });
    await expect(
      preview(admin).getByText(`${OWNER}/monorepo`, { exact: true }),
    ).toBeVisible({ timeout: 60_000 });
    await pressPrimary(admin, 'Save changes');
    await expect(admin).toHaveURL(/\/customize\//, {
      timeout: 60_000,
    });

    const stored = await tools.call<{
      workspace: { sources: Record<string, unknown>[] };
    }>('get_workspace', { workspace: name });
    expect(stored.workspace.sources).toEqual([
      {
        provider: workspaceLab.provider,
        owner: OWNER,
        filters: {
          languages: ['Go'],
          topics: { match: 'any', names: ['api', 'monorepo'] },
        },
      },
    ]);
  } finally {
    await deleteWorkspace(tools, name).catch(() => undefined);
    if (connected) {
      await tools.revokeInMuster().catch(() => undefined);
    }
  }
});
