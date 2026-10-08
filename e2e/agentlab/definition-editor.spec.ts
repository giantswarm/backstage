import type { Locator, Page } from '@playwright/test';
import { connectToMuster, expect, open, test } from './fixtures';
import { lab } from './lab';

/**
 * The definition-editor dialog the muster plugin shares between an ad-hoc
 * workflow (YAML) and an ad-hoc MCP server ("Edit as JSON"): Validate and Save
 * as live muster calls, a parse error shown in place of the last success, and
 * the dialog that cannot be closed while a call is in flight.
 *
 * The workflow is created, edited and deleted by the test. The server is the
 * lab's `lab-oauth-fixture`, which other proofs sign in to, so it is only
 * validated, never saved.
 */

const scope = `?installation=${lab.installation}`;
const MUSTER_CALL = /\/api\/muster\/call(\?|$)/;

/**
 * Holds every muster tool call until the returned function is called, so a
 * test can act on the dialog while a call is in flight. Released, the route
 * passes every later call straight through.
 */
async function holdMusterCalls(page: Page): Promise<() => void> {
  let release: () => void = () => {};
  const held = new Promise<void>(resolve => (release = resolve));
  await page.route(MUSTER_CALL, async route => {
    await held;
    await route.continue();
  });
  return release;
}

/** Escape, the header's close button and the footer's Close, while busy. */
async function expectLockedWhileBusy(dialog: Locator, page: Page) {
  const [headerClose, footerClose] = [
    dialog.getByRole('button', { name: 'Close' }).first(),
    dialog.getByRole('button', { name: 'Close' }).last(),
  ];
  await expect(footerClose).toBeDisabled();
  await page.keyboard.press('Escape');
  await headerClose.click();
  await expect(
    dialog,
    'the dialog stays open while a call is in flight',
  ).toBeVisible();
}

/** Replaces the CodeMirror editor's text the way a person does. */
async function replaceYaml(dialog: Locator, page: Page, text: string) {
  await dialog.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Delete');
  await page.keyboard.insertText(text);
}

const workflowYaml = (name: string, description: string) =>
  [
    `name: ${name}`,
    `description: ${description}`,
    'args: {}',
    'steps:',
    '  - id: list',
    '    tool: core_service_list',
    '    args: {}',
  ].join('\n');

test('an ad-hoc workflow is created, validated and edited in the definition editor', async ({
  admin,
}) => {
  test.setTimeout(180_000);
  const name = `e2e-definition-editor-${Date.now()}`;
  await open(admin, `/agent-platform/workflows${scope}`);
  const create = admin.getByRole('button', { name: 'Create workflow' });
  await connectToMuster(admin, create);
  await expect(create).toBeEnabled({ timeout: 60_000 });
  await create.click();

  const dialog = admin.getByRole('dialog');
  await expect(
    dialog.getByRole('heading', { name: 'Create workflow' }),
  ).toBeVisible();
  await replaceYaml(
    dialog,
    admin,
    workflowYaml(name, 'created by the e2e suite'),
  );
  await dialog.getByRole('button', { name: 'Validate' }).click();
  await expect(dialog.getByText('Definition is valid.')).toBeVisible({
    timeout: 30_000,
  });

  // A definition that no longer parses replaces the last success with the
  // parse error, line breaks kept, and calls nothing.
  await replaceYaml(dialog, admin, 'name: a\n  steps: [\n');
  await dialog.getByRole('button', { name: 'Save' }).click();
  const parseError = dialog.getByText(/^Invalid YAML: /);
  await expect(parseError).toBeVisible();
  await expect(parseError).toHaveCSS('white-space', 'pre-wrap');
  await expect(dialog.getByText('Definition is valid.')).toBeHidden();

  await replaceYaml(
    dialog,
    admin,
    workflowYaml(name, 'created by the e2e suite'),
  );
  const release = await holdMusterCalls(admin);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expectLockedWhileBusy(dialog, admin);
  release();
  await expect(
    dialog.getByText(/^Saved\. The workflow list has been refreshed/),
  ).toBeVisible({ timeout: 30_000 });

  try {
    await admin.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await admin.getByRole('link', { name }).first().click();
    await expect(admin.getByRole('heading', { name })).toBeVisible();

    // The edit dialog is seeded from the workflow and saved with the update tool.
    await admin.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(
      dialog.getByRole('heading', { name: `Edit ad-hoc workflow — ${name}` }),
    ).toBeVisible();
    await expect(dialog.locator('.cm-content')).toContainText(`name: ${name}`);
    await replaceYaml(
      dialog,
      admin,
      workflowYaml(name, 'edited by the e2e suite'),
    );
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog.getByText(/^Saved\./)).toBeVisible({ timeout: 30_000 });
    await dialog.getByRole('button', { name: 'Close' }).last().click();
    await expect(dialog).toBeHidden();
    await expect(
      admin.getByText('edited by the e2e suite').first(),
    ).toBeVisible({
      timeout: 30_000,
    });
  } finally {
    await open(admin, `/agent-platform/workflows/${name}${scope}`);
    await admin.getByRole('button', { name: 'Delete', exact: true }).click();
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(dialog.getByText(/^Done\./)).toBeVisible({ timeout: 30_000 });
  }
});

test("an ad-hoc server's Edit as JSON validates, shows a parse error and stays open while busy", async ({
  admin,
}) => {
  test.setTimeout(120_000);
  const server = 'lab-oauth-fixture';
  await open(admin, `/agent-platform/mcp-servers/${server}${scope}`);
  const editAsJson = admin.getByRole('button', { name: 'Edit as JSON' });
  await connectToMuster(admin, editAsJson);
  await editAsJson.click();

  const dialog = admin.getByRole('dialog');
  const editor = dialog.getByRole('textbox', {
    name: 'Server definition (JSON)',
  });
  await expect(
    dialog.getByRole('heading', { name: `Edit as JSON — ${server}` }),
  ).toBeVisible();
  await expect(editor).toHaveValue(new RegExp(`"name": "${server}"`));

  const release = await holdMusterCalls(admin);
  await dialog.getByRole('button', { name: 'Validate' }).click();
  await expectLockedWhileBusy(dialog, admin);
  release();
  await expect(
    dialog
      .getByText('Definition is valid.')
      .or(dialog.getByRole('alert'))
      .first(),
  ).toBeVisible({ timeout: 30_000 });
  // Whatever muster answered, a call's outcome never marks the text invalid.
  await expect(editor).not.toHaveAttribute('aria-invalid', 'true');

  await editor.fill('{ "name": ');
  await dialog.getByRole('button', { name: 'Validate' }).click();
  await expect(dialog.getByText(/^Invalid JSON: /)).toBeVisible();
  await expect(dialog.getByText('Definition is valid.')).toBeHidden();
  await expect(editor).toHaveAttribute('aria-invalid', 'true');

  // Not busy: Escape closes it, and it opens again on the server's definition.
  await admin.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await editAsJson.click();
  await expect(editor).toHaveValue(new RegExp(`"name": "${server}"`));
  await expect(dialog.getByText(/^Invalid JSON: /)).toBeHidden();
  await admin.keyboard.press('Escape');
});
