import type { Page } from '@playwright/test';
import { open } from './fixtures';
import { lab } from './lab';
import {
  connectToLabGitHub,
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

/**
 * Names the draft and picks the lab's GitHub: one provider instance shows as
 * text, several as a select (named "Select an option Provider").
 */
async function startDraft(page: Page, name: string): Promise<void> {
  await expect(
    page.getByRole('heading', { name: 'Create workspace' }),
  ).toBeVisible({ timeout: 60_000 });
  await page.getByRole('textbox', { name: /^Name/ }).fill(name);
  const providerSelect = source(page).getByRole('button', {
    name: /Provider$/,
  });
  await expect(
    providerSelect.or(source(page).getByText(/^Provider: /)),
  ).toBeVisible({ timeout: 60_000 });
  if (await providerSelect.isVisible()) {
    await providerSelect.click();
    await page
      .getByRole('option', {
        name: new RegExp(`^${lab.workspaces.provider} `),
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
    await open(admin, editorPath());
    await expect(
      admin.getByText(/There is no schedule/),
      'the editor has no schedule field, and says how the mirrors sync',
    ).toBeVisible({ timeout: 60_000 });

    const owner = source(admin).getByRole('textbox', { name: /^Owner/ });
    const connectPrompt = source(admin).getByTestId(
      `provider-connect-${lab.workspaces.provider}`,
    );
    await startDraft(admin, name);
    await expect(owner.or(connectPrompt)).toBeVisible({ timeout: 60_000 });
    if (await connectPrompt.isVisible()) {
      // Not connected yet: the prompt stands in place of the owner. Connect
      // the way a person does, then open the editor again.
      await expect(owner).toHaveCount(0);
      await snapshot(admin, 'workspace-editor-connect-prompt');
      test.skip(
        !lab.workspaces.githubFakeURL,
        'connecting to the lab GitHub needs AGENTLAB_GITHUB_FAKE_URL (see e2e/agentlab/README.md)',
      );
      await connectToLabGitHub(tools);
      connected = true;
      await open(admin, editorPath());
      await startDraft(admin, name);
      await expect(connectPrompt).toHaveCount(0, { timeout: 60_000 });
    }
    await owner.fill(OWNER);

    // Go repositories tagged api or monorepo: platform-api and monorepo; the
    // HCL platform-infra and the archived Python legacy-tool stay out.
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
    for (const outside of ['platform-infra', 'legacy-tool']) {
      await expect(
        preview(admin).getByText(`${OWNER}/${outside}`, { exact: true }),
      ).toHaveCount(0);
    }
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

    // An edit persists: monorepo included again, from the picker's
    // selected-only view, rejoins the preview.
    await source(admin)
      .getByRole('switch', { name: 'Selected only (1)' })
      .click({ force: true });
    await source(admin)
      .getByRole('button', { name: 'Include monorepo' })
      .click();
    await expect(
      preview(admin).getByText(`${OWNER}/monorepo`, { exact: true }),
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
      },
    ]);
  } finally {
    await deleteWorkspace(tools, name).catch(() => undefined);
    if (connected) {
      await tools
        .call('disconnect_provider', { provider: lab.workspaces.provider })
        .catch(() => undefined);
    }
  }
});
