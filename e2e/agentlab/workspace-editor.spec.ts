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

const editorPath = (name?: string) =>
  name
    ? `/agent-platform/workspaces/${lab.installation}/${lab.workspaces.organization}/${name}/edit`
    : `/agent-platform/workspaces/new?installation=${lab.installation}&organization=${lab.workspaces.organization}`;

const source = (page: Page) => page.getByTestId('workspace-source-0');
const preview = (page: Page) => page.getByTestId('workspace-preview');

test('a member creates a workspace from a language and topic filter, previews, excludes and reopens it', async ({
  admin,
  workspaceLab,
}, testInfo) => {
  test.skip(!!workspaceLab.unavailable, workspaceLab.unavailable);
  test.setTimeout(6 * 60_000);
  const tools = await workspaceLab.tools(lab.users.admin);
  const name = workspaceName('editor', testInfo.workerIndex);

  try {
    await open(admin, editorPath());
    await expect(
      admin.getByRole('heading', { name: 'Create workspace' }),
    ).toBeVisible({ timeout: 60_000 });
    await expect(
      admin.getByText(/There is no schedule/),
      'the editor has no schedule field, and says how the mirrors sync',
    ).toBeVisible();

    await admin.getByRole('textbox', { name: /^Name/ }).fill(name);
    if (
      await source(admin)
        .getByRole('button', { name: /^Provider/ })
        .isVisible()
    ) {
      await source(admin)
        .getByRole('button', { name: /^Provider/ })
        .click();
      await admin
        .getByRole('option', {
          name: new RegExp(`^${lab.workspaces.provider} `),
        })
        .click();
    }
    await source(admin)
      .getByRole('textbox', { name: /^Owner/ })
      .fill(OWNER);

    // Go repositories tagged api or monorepo: platform-api and monorepo; the
    // Go fork kagent stays out while forks do not count.
    await source(admin)
      .getByRole('button', { name: 'Go', exact: true })
      .click();
    await source(admin)
      .getByRole('button', { name: 'api', exact: true })
      .click();
    await source(admin)
      .getByRole('button', { name: 'monorepo', exact: true })
      .click();

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
    await expect(
      preview(admin).getByText(`${OWNER}/kagent`, { exact: true }),
    ).toHaveCount(0);
    await snapshot(admin, 'workspace-editor-preview');

    await preview(admin)
      .getByRole('button', { name: `Exclude ${OWNER}/monorepo` })
      .click();
    await expect(
      preview(admin).getByText(`${OWNER}/monorepo`, { exact: true }),
      'the exclusion removes it from the preview',
    ).toHaveCount(0, { timeout: 60_000 });
    await expect(preview(admin).getByTestId('preview-total')).toContainText(
      '1 repository',
    );
    await expect(preview(admin)).toContainText('1 excluded');

    await admin.getByRole('button', { name: 'Create workspace' }).click();
    await expect(admin).toHaveURL(/\/customize\//, {
      timeout: 60_000,
    });

    // Reopen: the same filters and the exclusion.
    await open(admin, editorPath(name));
    await expect(
      source(admin).getByRole('button', { name: 'Go', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true', { timeout: 60_000 });
    for (const topic of ['api', 'monorepo']) {
      await expect(
        source(admin).getByRole('button', { name: topic, exact: true }),
      ).toHaveAttribute('aria-pressed', 'true');
    }
    await expect(
      source(admin).getByRole('switch', { name: 'Selected only (1)' }),
      'the exclusion is kept',
    ).toBeVisible();
    await snapshot(admin, 'workspace-editor-reopened');

    // An edit persists: forks now count, so the Go fork joins.
    await source(admin)
      .getByRole('checkbox', { name: 'Forks count' })
      .check({ force: true });
    await expect(
      preview(admin).getByText(`${OWNER}/kagent`, { exact: true }),
    ).toBeVisible({ timeout: 60_000 });
    await admin.getByRole('button', { name: 'Save changes' }).click();
    await expect(admin).toHaveURL(/\/customize\//, {
      timeout: 60_000,
    });

    const stored = await tools.call<{
      workspace: { sources: Record<string, unknown>[] };
    }>('get_workspace', { workspace: name });
    expect(stored.workspace.sources).toEqual([
      {
        provider: lab.workspaces.provider,
        owner: OWNER,
        filters: {
          languages: ['Go'],
          topics: { match: 'any', names: ['api', 'monorepo'] },
        },
        exclude: ['monorepo'],
        includeForks: true,
      },
    ]);
  } finally {
    await deleteWorkspace(tools, name).catch(() => undefined);
  }
});
