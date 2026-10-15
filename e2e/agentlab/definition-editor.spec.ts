import type { Locator, Page } from '@playwright/test';
import { connectToMuster, expect, open, test } from './fixtures';
import { lab } from './lab';

/**
 * The muster plugin's definition-editor dialog as the shell offers it: an
 * ad-hoc connector's **Edit as JSON…** (its page's More actions) — Validate as
 * a live muster call, a parse error shown on the editor in place of the last
 * success and cleared as soon as the text parses, and the dialog that cannot
 * be closed while a call is in flight. (Workflows are read-only in the shell,
 * so its YAML twin for workflows is offered nowhere there; `workflows.spec.ts`
 * pins that.)
 *
 * The server is the lab's `lab-oauth-fixture`, which other proofs sign in
 * to, so it is only validated, never saved.
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

test("an ad-hoc server's Edit as JSON validates, shows a parse error and stays open while busy", async ({
  admin,
}) => {
  test.setTimeout(120_000);
  const server = 'lab-oauth-fixture';
  await open(admin, `/agent-platform/connectors/${server}${scope}`);
  const moreActions = admin.getByRole('button', { name: 'More actions' });
  await connectToMuster(admin, moreActions);
  const editAsJson = async () => {
    await moreActions.click();
    await admin.getByRole('menuitem', { name: /^Edit as JSON/ }).click();
  };
  // The shell offers Edit as JSON only for a connector its Add connector
  // wizard cannot edit; a lab whose connectors the wizard covers has no way
  // to the dialog, which is then not this lab's to prove.
  await moreActions.click();
  await admin.getByRole('menu', { name: 'More actions' }).waitFor();
  const offered = await admin
    .getByRole('menuitem', { name: /^Edit as JSON/ })
    .isVisible();
  await admin.keyboard.press('Escape');
  test.skip(
    !offered,
    `${server}: its Edit is the Add connector wizard here, so Edit as JSON is not offered`,
  );
  await editAsJson();

  const dialog = admin.getByRole('dialog');
  const editor = dialog.getByRole('textbox', {
    name: 'Connector definition (JSON)',
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
  await expect(editor, 'the blocked call focuses the editor').toBeFocused();
  // Fixed, the error goes at once, without another Validate.
  await editor.fill(`{ "name": "${server}" }`);
  await expect(editor).not.toHaveAttribute('aria-invalid', 'true');
  await expect(dialog.getByText(/^Invalid JSON: /)).toBeHidden();

  // Not busy: Escape closes it, and it opens again on the server's definition.
  await admin.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await editAsJson();
  await expect(editor).toHaveValue(new RegExp(`"name": "${server}"`));
  await expect(dialog.getByText(/^Invalid JSON: /)).toBeHidden();
  await admin.keyboard.press('Escape');
});
